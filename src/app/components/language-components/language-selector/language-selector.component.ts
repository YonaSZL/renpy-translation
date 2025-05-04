import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TranslateModule, TranslateService} from '@ngx-translate/core';
import {HttpClient} from '@angular/common/http';
import {forkJoin, of} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {LanguageLocalizationService} from '../../../services/language-localization.service';
import {SupportedLanguage} from '../../../models/supported-language.model';

@Component({
	selector: 'app-language-selector',
	standalone: true,
	imports: [CommonModule, TranslateModule],
	templateUrl: './language-selector.component.html',
	styleUrl: './language-selector.component.scss'
})
export class LanguageSelectorComponent implements OnInit {
	languages: SupportedLanguage[] = [];
	currentLang: string = 'en';
	availableLanguageCodes: string[] = [];

	@Output() languageChanged = new EventEmitter<string>();

	constructor(
		private readonly translateService: TranslateService,
		private readonly httpClient: HttpClient,
		private readonly languageLocalizationService: LanguageLocalizationService
	) {
	}

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
		const commonLanguageCodes = ['en', 'fr', 'es', 'de', 'it', 'pt-pt', 'ru', 'zh-cn', 'zh-tw', 'ja', 'ko', 'hi', 'pl', 'nl', 'uk', 'sv', 'ro', 'ar', 'bg', 'cs', 'da', 'el', 'et', 'fi', 'id', 'lv', 'lt', 'no', 'sk', 'sl', 'tr'];

		const requests = commonLanguageCodes.map(code =>
			this.httpClient.get(`${baseUrl}${code}.json`).pipe(
				map(() => code),
				catchError(() => of(null))
			)
		);

		forkJoin(requests).subscribe(results => {
			this.availableLanguageCodes = results.filter(code => code !== null);
			this.updateLanguageNames(this.availableLanguageCodes);
		});
	}

	updateLanguageNames(languageCodes: string[]): void {
		// Clear existing languages
		this.languages = [];

		// For each available language, get its translated name in the current language
		const observables = languageCodes.map(code => {
			return this.translateService.get(this.languageLocalizationService.getLanguageNameKey(code)).pipe(
				map(name => ({code, name}))
			);
		});

		forkJoin(observables).subscribe(langObjects => {
			// Sort languages so that the current language is first
			this.languages = langObjects;
			console.log('Languages:', this.languages);
			this.languages.sort((a, b) => {
				if (a.code === this.currentLang) return -1;
				if (b.code === this.currentLang) return 1;
				return 0;
			});
		});
	}

	changeLanguage(event: Event): void {
		const select = event.target as HTMLSelectElement;
		const lang = select.value;
		this.currentLang = lang;
		this.translateService.use(lang);
		this.languageChanged.emit(lang);

		// Update language names in the new language
		this.updateLanguageNames(this.availableLanguageCodes);
	}
}
