import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import JSZip from 'jszip';
import { RenpyFileParserService } from './renpy-file-parser.service';
import { TranslationProcessorService } from './translation-processor.service';
import { TranslationApiService } from './translation-api.service';

interface FileMeta {
  file: File;
  relativePath: string;
  textsToTranslate: string[];
  charCount: number;
}

@Injectable({ providedIn: 'root' })
export class FolderTranslationService {
  constructor(
    private readonly renpyFileParser: RenpyFileParserService,
    private readonly translationProcessor: TranslationProcessorService,
    private readonly translationApi: TranslationApiService
  ) {}

  private getRelativePath(f: File): string {
    return (f as any).webkitRelativePath || f.name;
  }

  private async preScan(files: File[], selectedApi: string): Promise<FileMeta[]> {
    const metas: FileMeta[] = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.rpy')) continue;
      const text = await file.text();
      const textsToTranslate = this.renpyFileParser.extractLines(text);
      const charCount = this.translationApi.calculateCharacterCount(selectedApi, textsToTranslate);
      metas.push({
        file,
        relativePath: this.getRelativePath(file),
        textsToTranslate,
        charCount
      });
    }
    return metas;
  }

  private remainingFromUsage(selectedApi: string, usage: any): number {
    if (selectedApi === 'google-free') {
      const monthlyRemaining = Math.max(0, (usage.character_limit || 0) - (usage.character_count || 0));
      const weeklyRemaining = Math.max(0, (usage.weekly_limit || monthlyRemaining) - (usage.weekly_count || 0));
      const dailyRemaining = Math.max(0, (usage.daily_limit || weeklyRemaining) - (usage.daily_count || 0));
      return Math.min(monthlyRemaining, weeklyRemaining, dailyRemaining);
    }
    return Math.max(0, (usage.character_limit || 0) - (usage.character_count || 0));
  }

  async translateFiles(
    files: File[],
    selectedApi: string,
    apiKey: string,
    targetLanguage: string
  ): Promise<Blob> {
    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    const metas = await this.preScan(files, selectedApi);
    if (!metas.length) {
      throw new Error('No .rpy files found');
    }

    // Fetch usage
    const usage = await firstValueFrom(
      this.translationApi.fetchApiUsage(selectedApi, apiKey)
    );

    let remaining = this.remainingFromUsage(selectedApi, usage);

    // For google-free, enforce per-file cap as local rule
    const fileCharLimit = (selectedApi === 'google-free') ? (usage.file_char_limit ?? 5000) : Number.MAX_SAFE_INTEGER;

    // Sort by ascending char count
    metas.sort((a, b) => a.charCount - b.charCount);

    const zip = new JSZip();

    for (const meta of metas) {
      if (meta.charCount === 0) continue;

      // Enforce per-file cap for google
      if (selectedApi === 'google-free' && meta.charCount > fileCharLimit) {
        continue; // skip
      }

      // Read original content and lines to fill
      const fileText = await meta.file.text();
      const linesToFill = this.renpyFileParser.findLinesToFill(fileText);

      if (meta.charCount <= remaining) {
        // Full translate
        const result = await firstValueFrom(
          this.translationApi.translateTexts(selectedApi, meta.textsToTranslate, targetLanguage, apiKey)
        );
        const translated = result.translatedTexts;
        const filled = this.translationProcessor.createFilledLines(linesToFill, translated);
        const replaced = this.translationProcessor.replaceLines(fileText, filled, (l: string) => this.renpyFileParser.extractCommand(l));
        zip.file(meta.relativePath, replaced);
        remaining -= meta.charCount;
      } else if (remaining > 0) {
        // Partial translate to fit remainder
        let count = 0;
        let acc = 0;
        while (count < meta.textsToTranslate.length && acc + meta.textsToTranslate[count].length <= remaining) {
          acc += meta.textsToTranslate[count].length;
          count++;
        }
        if (count > 0) {
          const partialTexts = meta.textsToTranslate.slice(0, count);
          const partialResult = await firstValueFrom(
            this.translationApi.translateTexts(selectedApi, partialTexts, targetLanguage, apiKey)
          );
          const translated = partialResult.translatedTexts;
          const partialLinesToFill = linesToFill.slice(0, count);
          const filled = this.translationProcessor.createFilledLines(partialLinesToFill, translated);
          const replaced = this.translationProcessor.replaceLines(fileText, filled, (l: string) => this.renpyFileParser.extractCommand(l));
          zip.file(meta.relativePath, replaced);
        }
        // Stop processing further files after first partial
        break;
      } else {
        // No remaining quota
        break;
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    return blob;
  }
}
