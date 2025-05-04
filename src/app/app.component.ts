import {Component, OnInit} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {CommonModule} from '@angular/common';
import {FileUploadComponent} from './components/file-upload/file-upload.component';
import {FileViewerComponent} from './components/file-viewer/file-viewer.component';
import {LanguageSelectorComponent} from './components/language-selector/language-selector.component';
import {ApiSelectorComponent} from './components/api-selector/api-selector.component';
import {FileTranslationComponent} from './components/file-translation/file-translation.component';
import {TranslateModule, TranslateService} from '@ngx-translate/core';
import {Title} from '@angular/platform-browser';
import {GoogleTranslateService} from './services/google-translate.service';
import {firstValueFrom} from 'rxjs';
import {ApiDetails} from './models/api-details';

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [RouterOutlet, CommonModule, FileUploadComponent, FileViewerComponent, LanguageSelectorComponent, ApiSelectorComponent, FileTranslationComponent, TranslateModule],
	templateUrl: './app.component.html',
	styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
	title = 'renpy-translation';
	fileContent: string | null = null;
	fileName: string = '';
	selectedApi: string = '';
	apiKey: string = '';
	targetLanguage: string = '';

	constructor(
		private readonly translateService: TranslateService,
		private readonly titleService: Title,
		private readonly googleTranslateService: GoogleTranslateService
	) {
		this.translateService.setDefaultLang('en');
		this.translateService.use('en');
	}

	ngOnInit(): void {
		// Set the page title from translations
		this.translateService.get('APP_TITLE').subscribe((title: string) => {
			this.titleService.setTitle(title);
		});
	}

	onLanguageChanged(lang: string): void {
		this.translateService.use(lang);

		// Update the page title when language changes
		this.translateService.get('APP_TITLE').subscribe((title: string) => {
			this.titleService.setTitle(title);
		});
	}

	handleFileSelected(file: File): void {
		this.fileName = file.name;
		const reader = new FileReader();

		reader.onload = (e: ProgressEvent<FileReader>) => {
			if (e.target && typeof e.target.result === 'string') {
				this.fileContent = e.target.result;
			}
		};

		reader.onerror = () => {
			console.error('Error reading file');
			this.translateService.get('ERROR_READING_FILE').subscribe((errorMsg: string) => {
				this.fileContent = errorMsg;
			});
		};

		reader.readAsText(file);
	}

	handleApiSelected(apiSettings: ApiDetails): void {
		this.selectedApi = apiSettings.api;
		this.apiKey = apiSettings?.key ?? '';
		this.targetLanguage = apiSettings?.language ?? this.translateService.getDefaultLang();

		console.log('API Settings:', apiSettings);
		// We don't automatically translate when API settings change
		// The user must explicitly request translation
	}

	/**
	 * Translate text using the selected API
	 * @param text The text to translate
	 * @returns Promise of the translated text
	 */
	translateText(text: string): Promise<string> {
		if (this.selectedApi === 'google-free') {
			return firstValueFrom(this.googleTranslateService.translate(text, this.targetLanguage));
		} else {
			// For other APIs, you would implement the translation logic here
			// This is just a placeholder for now
			console.log(`Translation with ${this.selectedApi} not implemented yet`);
			return Promise.resolve(text);
		}
	}

	/**
	 * Translate the current file content
	 * This is just a demo of how to use the translation service
	 */
	translateFileContent(): void {
		if (!this.fileContent || !this.targetLanguage) {
			return;
		}

		// In a real application, you would parse the file content and translate only the text that needs translation
		// For this demo, we'll just translate the entire file content
		this.translateText(this.fileContent)
			.then(translatedText => {
				console.log('Translated text:', translatedText);
				// In a real application, you would update the UI with the translated text
				// For this demo, we'll just log it to the console
			})
			.catch(error => {
				console.error('Error translating text:', error);
			});
	}
}
