import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

interface Language {
  code: string;
  name: string;
}

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './language-selector.component.html',
  styleUrl: './language-selector.component.css'
})
export class LanguageSelectorComponent implements OnInit {
  languages: Language[] = [];
  currentLang: string = 'en';

  @Output() languageChanged = new EventEmitter<string>();

  constructor(
    private readonly translateService: TranslateService,
    private readonly http: HttpClient
  ) {}

  ngOnInit(): void {
    this.currentLang = this.translateService.currentLang || this.translateService.defaultLang || 'en';
    this.loadAvailableLanguages();
  }

  loadAvailableLanguages(): void {
    // Get the base URL for translations from the TranslateService configuration
    const baseUrl = './i18n/';

    // Try to detect available language files by checking common languages
    // This is a simple approach - in a real app, you might want to have an API endpoint
    // that returns the list of available languages
    const commonLanguageCodes = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'hi', 'pl', 'nl', 'uk', 'sv', 'ro'];

    const requests = commonLanguageCodes.map(code =>
      this.http.get(`${baseUrl}${code}.json`).pipe(
        map(() => code),
        catchError(() => of(null))
      )
    );

    forkJoin(requests).subscribe(results => {
      const availableCodes = results.filter(code => code !== null) as string[];

      // For each available language, get its translated name
      availableCodes.forEach(code => {
        this.translateService.get(this.getLanguageNameKey(code)).subscribe(name => {
          this.languages.push({ code, name });
        });
      });
    });
  }

  getLanguageNameKey(code: string): string {
    // Map language codes to their translation keys
    // This assumes you have translation keys like "ENGLISH", "FRENCH", etc.
    const codeToKey: { [key: string]: string } = {
      'en': 'ENGLISH',
      'fr': 'FRENCH',
      'es': 'SPANISH',
      'de': 'GERMAN',
      'it': 'ITALIAN',
      'pt': 'PORTUGUESE',
      'ru': 'RUSSIAN',
      'zh': 'CHINESE',
      'ja': 'JAPANESE',
      'ko': 'KOREAN',
      'hi': 'HINDI',
      'pl': 'POLISH',
      'nl': 'DUTCH',
      'uk': 'UKRAINIAN',
      'sv': 'SWEDISH',
      'ro': 'ROMANIAN'
    };

    return codeToKey[code] || code.toUpperCase();
  }

  changeLanguage(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const lang = select.value;
    this.currentLang = lang;
    this.translateService.use(lang);
    this.languageChanged.emit(lang);
  }
}
