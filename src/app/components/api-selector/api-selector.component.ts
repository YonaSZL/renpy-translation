import {Component, EventEmitter, OnDestroy, OnInit, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {TranslateModule, TranslateService} from '@ngx-translate/core';
import {TranslationApiService} from '../../services/translation-api.service';
import {catchError, finalize} from 'rxjs/operators';
import {of, Subscription} from 'rxjs';
import {LanguageLocalizationService} from '../../services/language-localization.service';
import {SupportedLanguage} from '../../models/supported-language.model';
import {ApiDetails} from '../../models/api-details';

@Component({
	selector: 'app-api-selector',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateModule],
	templateUrl: './api-selector.component.html',
	styleUrl: './api-selector.component.css'
})
export class ApiSelectorComponent implements OnInit, OnDestroy {
	apis: ApiDetails[] = [];
	selectedApi: string = 'deepl-free';
	apiKey: string = '';
	availableLanguages: SupportedLanguage[] = [];
	selectedLanguage: string = '';
	currentPageLanguage: string = '';
	isLoading: boolean = false;
	errorMessage: string = '';
	@Output() apiSelected = new EventEmitter<ApiDetails>();
	private langChangeSubscription: Subscription | null = null;

	constructor(
		private readonly translateService: TranslateService,
		private readonly translationApiService: TranslationApiService,
		public readonly languageLocalizationService: LanguageLocalizationService
	) {
	}

	initializeApis(): void {
		this.apis = [
			{api: 'deepl-free', name: `DeepL (${this.translateService.instant('FREE')})`},
			{api: 'google-free', name: `Google Translate (${this.translateService.instant('FREE')})`},
		];
	}

	ngOnInit(): void {
		this.currentPageLanguage = this.translateService.currentLang || this.translateService.defaultLang || 'en';
		this.initializeApis();

		// Initialize with default values and apply settings
		this.onApiChange();

		// For Google Free API, onSubmit is called in onApiChange
		// For DeepL API, onSubmit is called after fetching languages

		this.langChangeSubscription = this.translateService.onLangChange.subscribe(event => {
			this.currentPageLanguage = event.lang;
			this.updateDefaultOption();
			this.initializeApis();
			this.updateLanguageNames();

			// Apply settings when language changes
			this.onSubmit();
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
			name: `${this.translateService.instant('DEFAULT')} (${this.languageLocalizationService.getLanguageName(this.currentPageLanguage)})`
		});

		this.selectedLanguage = 'default';

		// Special case for Google Translate (Free) which doesn't require an API key
		if (this.selectedApi === 'google-free') {
			this.fetchLanguages(this.selectedApi);
			// Apply settings immediately for Google Free
			this.onSubmit();
			return;
		}

		if (!this.apiKey) {
			this.isLoading = false;
			return;
		}

		if (['deepl-free'].includes(this.selectedApi)) {
			this.fetchLanguages(this.selectedApi);
		} else {
			this.isLoading = false;
			this.errorMessage = 'Unknown API selected';
		}
	}

	onApiKeyChange(): void {
		// Debounce the API key input to avoid too many requests
		if (this.apiKeyTimeout) {
			clearTimeout(this.apiKeyTimeout);
		}

		this.apiKeyTimeout = setTimeout(() => {
			if (this.apiKey && this.apiKey.length > 0) {
				this.onApiChange();
			} else {
				// If API key is empty, reset available languages to just the default option
				// for DeepL API which requires a key
				if (this.selectedApi === 'deepl-free') {
					this.availableLanguages = [];
					// Add only the default language option
					this.availableLanguages.push({
						code: 'default',
						name: `${this.translateService.instant('DEFAULT')} (${this.languageLocalizationService.getLanguageName(this.currentPageLanguage)})`
					});
					this.selectedLanguage = 'default';
				}

				// Call onSubmit to notify parent component
				// This is important for APIs that require a key (like DeepL)
				this.onSubmit();
			}
		}, 500); // Wait for 500ms after the user stops typing
	}

	private apiKeyTimeout: any;

	onSubmit(): void {
		// Check if we have valid settings to apply
		if (!this.selectedLanguage) {
			return;
		}

		// Note: We're removing the early return for DeepL with empty API key
		// to ensure the parent component is notified when the API key is erased
		// This allows the file-translation component to update its state accordingly

		const language = this.selectedLanguage === 'default' ? this.currentPageLanguage : this.selectedLanguage;

		// For Google Translate (Free), we don't need an API key
		const apiKey = this.selectedApi === 'google-free' ? '' : this.apiKey;

		const selectedApiObj = this.apis.find(api => api.api === this.selectedApi);

		// Emit the selected API details
		this.apiSelected.emit({
			api: this.selectedApi,
			key: apiKey,
			name: selectedApiObj?.name ?? this.selectedApi,
			language
		});
	}

	private fetchLanguages(api: string): void {
		let apiMethod;
		let apiDisplayName;

		switch (api) {
			case 'deepl-free':
				apiMethod = this.translationApiService.fetchDeeplSupportedLanguages(this.apiKey);
				apiDisplayName = 'DeepL Free API';
				break;
			case 'google-free':
				apiMethod = this.translationApiService.fetchGoogleFreeLanguages();
				apiDisplayName = 'Google Translate';
				break;
			default:
				this.errorMessage = 'Unknown API selected';
				this.isLoading = false;
				return;
		}

		apiMethod
			.pipe(
				catchError(error => {
					this.errorMessage = error.message ?? `Failed to fetch languages from ${apiDisplayName}`;
					return of([]);
				}),
				finalize(() => {
					this.isLoading = false;
				})
			)
			.subscribe(languages => {
				this.addLanguagesToAvailable(languages);
				this.updateLanguageNames();

				// Apply settings immediately after fetching languages
				if (this.selectedApi === 'deepl-free' && this.apiKey) {
					this.onSubmit();
				}
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
		const languageName = this.languageLocalizationService.getLanguageName(this.currentPageLanguage);

		if (defaultOption) {
			defaultOption.name = `${defaultText} (${languageName})`;
		} else {
			this.availableLanguages.unshift({
				code: 'default',
				name: `${defaultText} (${languageName})`
			});
		}
	}

	/**
	 * Update language names based on the current language
	 * This is called when the language changes to update the displayed language names
	 */
	private updateLanguageNames(): void {
		// Skip if there are no languages to update
		if (this.availableLanguages.length <= 1) {
			return;
		}

		// Update each language name (except the default option)
		for (let i = 0; i < this.availableLanguages.length; i++) {
			const lang = this.availableLanguages[i];
			if (lang.code !== 'default') {
				// Try to get a translated name from our language service
				const translatedName = this.languageLocalizationService.getLanguageNameFromCode(lang.code, lang.name);
				this.availableLanguages[i] = {
					...lang,
					name: translatedName
				};
			}
		}
	}
}
