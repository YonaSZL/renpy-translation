import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TranslateModule, TranslateService} from '@ngx-translate/core';
import {RenpyFileParserService} from '../../../services/renpy-file-parser.service';
import {TranslationProcessorService} from '../../../services/translation-processor.service';
import {TranslationApiService} from '../../../services/translation-api.service';
import {firstValueFrom} from 'rxjs';
import JSZip from 'jszip';
import {saveAs} from 'file-saver';

interface FolderFileMeta {
	file: File;
	relativePath: string;
	textsToTranslate: string[];
	charCount: number;
	status: 'pending' | 'skipped' | 'partial' | 'translated' | 'error';
	error?: string;
}

@Component({
	selector: 'app-folder-translation',
	standalone: true,
	imports: [CommonModule, TranslateModule],
	templateUrl: './folder-translation.component.html',
	styleUrls: ['./folder-translation.component.scss']
})
export class FolderTranslationComponent {
	@Input() files: File[] = [];
	@Input() selectedApi: string = '';
	@Input() apiKey: string = '';
	@Input() targetLanguage: string = '';

	isScanning = false;
	isTranslating = false;
	scanDone = false;
	progress = 0;
	overallMessage = '';

	fileMetas: FolderFileMeta[] = [];

	constructor(
		private readonly translateService: TranslateService,
		private readonly renpyFileParser: RenpyFileParserService,
		private readonly translationProcessor: TranslationProcessorService,
		private readonly translationApi: TranslationApiService
	) {}

	private getRelativePath(f: File): string {
		return (f as any).webkitRelativePath || f.name;
	}

	async preScanFolder(): Promise<void> {
		this.isScanning = true;
		this.scanDone = false;
		this.fileMetas = [];
		const metas: FolderFileMeta[] = [];

		for (const file of this.files) {
			try {
				const text = await file.text();
				const textsToTranslate = this.renpyFileParser.extractLines(text);
				const charCount = this.translationApi.calculateCharacterCount(this.selectedApi, textsToTranslate);
				metas.push({
					file,
					relativePath: this.getRelativePath(file),
					textsToTranslate,
					charCount,
					status: 'pending'
				});
			} catch (e: any) {
				metas.push({
					file,
					relativePath: this.getRelativePath(file),
					textsToTranslate: [],
					charCount: 0,
					status: 'error',
					error: e?.message || 'read failed'
				});
			}
		}

		// Only keep .rpy files safeguard
		this.fileMetas = metas.filter(m => m.file.name.toLowerCase().endsWith('.rpy'));
		this.scanDone = true;
		this.isScanning = false;
	}

	private remainingFromUsage(usage: any): number {
		if (this.selectedApi === 'google-free') {
			const monthlyRemaining = Math.max(0, (usage.character_limit || 0) - (usage.character_count || 0));
			const weeklyRemaining = Math.max(0, (usage.weekly_limit || monthlyRemaining) - (usage.weekly_count || 0));
			const dailyRemaining = Math.max(0, (usage.daily_limit || weeklyRemaining) - (usage.daily_count || 0));
			return Math.min(monthlyRemaining, weeklyRemaining, dailyRemaining);
		}
		// DeepL free: monthly remaining only
		return Math.max(0, (usage.character_limit || 0) - (usage.character_count || 0));
	}

	async translateFolder(): Promise<void> {
		if (!this.scanDone) {
			await this.preScanFolder();
		}
		if (!this.fileMetas.length) {
			return;
		}

		this.isTranslating = true;
		this.progress = 0;
		this.overallMessage = '';

		// Fetch usage
		const usage = await firstValueFrom(this.translationApi.fetchApiUsage(this.selectedApi, this.apiKey));
		let remaining = this.remainingFromUsage(usage);

		// Google per-file hard cap: 5000
		const googleFileCap = (this.selectedApi === 'google-free') ? (usage.file_char_limit || 5000) : Number.MAX_SAFE_INTEGER;

		// Sort by ascending charCount
		const candidates = [...this.fileMetas]
			.filter(m => m.status !== 'error')
			.sort((a, b) => a.charCount - b.charCount);

		const zip = new JSZip();
		let processed = 0;
		let partialUsed = false;

		for (const meta of candidates) {
			// Skip if over Google per-file cap
			if (meta.charCount > googleFileCap && this.selectedApi === 'google-free') {
				meta.status = 'skipped';
				processed++;
				this.progress = Math.round((processed / candidates.length) * 100);
				continue;
			}

			if (remaining <= 0) {
				meta.status = 'skipped';
				processed++;
				this.progress = Math.round((processed / candidates.length) * 100);
				continue;
			}

			try {
				const fileText = await meta.file.text();
				const linesToFill = this.renpyFileParser.findLinesToFill(fileText);

				if (meta.charCount <= remaining) {
					// Full translate
					const translationResult = await firstValueFrom(
						this.translationApi.translateTexts(this.selectedApi, meta.textsToTranslate, this.targetLanguage, this.apiKey)
					);
					const translated = translationResult.translatedTexts;
					const filled = this.translationProcessor.createFilledLines(linesToFill, translated);
					const replaced = this.translationProcessor.replaceLines(fileText, filled, (l: string) => this.renpyFileParser.extractCommand(l));
					zip.file(meta.relativePath, replaced);
					meta.status = 'translated';
					remaining -= meta.charCount;
				} else if (!partialUsed) {
					// Partial translate: take as many lines as fit into remaining (line-boundary)
					let acc = 0;
					let count = 0;
					for (const t of meta.textsToTranslate) {
						if (acc + t.length > remaining) break;
						acc += t.length;
						count++;
					}
					const partialTexts = meta.textsToTranslate.slice(0, count);
					const partialResult = await firstValueFrom(
						this.translationApi.translateTexts(this.selectedApi, partialTexts, this.targetLanguage, this.apiKey)
					);
					const translated = partialResult.translatedTexts;
					const partialLinesToFill = linesToFill.slice(0, count);
					const filled = this.translationProcessor.createFilledLines(partialLinesToFill, translated);
					const replaced = this.translationProcessor.replaceLines(fileText, filled, (l: string) => this.renpyFileParser.extractCommand(l));
					zip.file(meta.relativePath, replaced);
					meta.status = 'partial';
					remaining = 0;
					partialUsed = true;
					// From now on, all others will be skipped due to remaining==0 (per user rule)
				} else {
					// Should not reach due to earlier remaining check, but keep for safety
					meta.status = 'skipped';
				}
			} catch (e: any) {
				meta.status = 'error';
				meta.error = e?.message || 'translate failed';
			}

			processed++;
			this.progress = Math.round((processed / candidates.length) * 100);
		}

		// Add untouched/errored files as original content? Requirement says: "will give back a folder (if a folder was given)" — typically expected to include only translated outputs. We'll include translated/partial files; skipped remain absent.

		// Generate zip
		const zipNameTs = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
		const zipName = `translations_${zipNameTs}.zip`;
		const blob = await zip.generateAsync({type: 'blob'});
		saveAs(blob, zipName);

		this.isTranslating = false;
	}
}
