import { Component, EventEmitter, OnInit, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TranslationApiService, SupportedLanguage } from '../../services/translation-api.service';
import { catchError, finalize } from 'rxjs/operators';
import { of, Subscription } from 'rxjs';

interface TranslationApi {
  id: string;
  name: string;
}

interface LanguageOption {
  code: string;
  name: string;
}

@Component({
  selector: 'app-api-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './api-selector.component.html',
  styleUrl: './api-selector.component.css'
})
export class ApiSelectorComponent implements OnInit, OnDestroy {
  private langChangeSubscription: Subscription | null = null;
  apis: TranslationApi[] = [
    { id: 'deepl', name: 'DeepL' },
    { id: 'google', name: 'Google Translation' },
    { id: 'azure', name: 'Azure' }
  ];

  selectedApi: string = 'deepl';
  apiKey: string = '';
  availableLanguages: LanguageOption[] = [];
  selectedLanguage: string = '';
  currentPageLanguage: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';

  @Output() apiSelected = new EventEmitter<{ api: string; key: string; language: string }>();

  constructor(
    private readonly translateService: TranslateService,
    private readonly translationApiService: TranslationApiService
  ) {}

  ngOnInit(): void {
    this.currentPageLanguage = this.translateService.currentLang || this.translateService.defaultLang || 'en';
    this.onApiChange();

    this.langChangeSubscription = this.translateService.onLangChange.subscribe(event => {
      this.currentPageLanguage = event.lang;
      this.updateDefaultOption();
    });
  }

  ngOnDestroy(): void {
    if (this.langChangeSubscription) {
      this.langChangeSubscription.unsubscribe();
      this.langChangeSubscription = null;
    }
  }

  onApiChange(): void {
    this.errorMessage = '';
    this.isLoading = true;
    this.availableLanguages = [];

    this.availableLanguages.push({
      code: 'default',
      name: `${this.translateService.instant('DEFAULT')} (${this.getLanguageName(this.currentPageLanguage)})`
    });

    this.selectedLanguage = 'default';

    if (!this.apiKey) {
      this.isLoading = false;
      return;
    }

    switch (this.selectedApi) {
      case 'deepl':
        this.fetchDeeplLanguages();
        break;
      case 'google':
        this.fetchGoogleLanguages();
        break;
      case 'azure':
        this.fetchAzureLanguages();
        break;
      default:
        this.isLoading = false;
        this.errorMessage = 'Unknown API selected';
    }
  }

  private fetchDeeplLanguages(): void {
    this.translationApiService.fetchDeeplSupportedLanguages(this.apiKey)
      .pipe(
        catchError(error => {
          this.errorMessage = error.message ?? 'Failed to fetch languages from DeepL API';
          return of([]);
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe(languages => {
        this.addLanguagesToAvailable(languages);
      });
  }

  private fetchGoogleLanguages(): void {
    this.translationApiService.fetchGoogleSupportedLanguages(this.apiKey)
      .pipe(
        catchError(error => {
          this.errorMessage = error.message ?? 'Failed to fetch languages from Google Translation API';
          return of([]);
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe(languages => {
        this.addLanguagesToAvailable(languages);
      });
  }

  private fetchAzureLanguages(): void {
    this.translationApiService.fetchAzureSupportedLanguages(this.apiKey)
      .pipe(
        catchError(error => {
          this.errorMessage = error.message ?? 'Failed to fetch languages from Azure Translator API';
          return of([]);
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe(languages => {
        this.addLanguagesToAvailable(languages);
      });
  }

  private addLanguagesToAvailable(languages: SupportedLanguage[]): void {
    languages.forEach(lang => {
      if (lang.code !== 'default' && !this.availableLanguages.some(l => l.code === lang.code)) {
        this.availableLanguages.push(lang);
      }
    });
  }

  private updateDefaultOption(): void {
    const defaultOption = this.availableLanguages.find(lang => lang.code === 'default');

    const defaultText = this.translateService.instant('DEFAULT');
    const languageName = this.getLanguageName(this.currentPageLanguage);

    if (defaultOption) {
      defaultOption.name = `${defaultText} (${languageName})`;
    } else {
      this.availableLanguages.unshift({
        code: 'default',
        name: `${defaultText} (${languageName})`
      });
    }
  }

  getLanguageName(code: string): string {
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

    const translationKey = codeToKey[code.toLowerCase()] || code.toUpperCase();
    const translatedName = this.translateService.instant(translationKey);
    return translatedName !== translationKey ? translatedName : code.toUpperCase();
  }

  onSubmit(): void {
    const language = this.selectedLanguage === 'default' ? this.currentPageLanguage : this.selectedLanguage;

    this.apiSelected.emit({
      api: this.selectedApi,
      key: this.apiKey,
      language: language
    });
  }
}
