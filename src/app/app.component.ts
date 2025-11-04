import {Component, OnInit} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {CommonModule} from '@angular/common';
import {FileUploadComponent} from './components/file-components/file-upload/file-upload.component';
import {FileViewerComponent} from './components/file-components/file-viewer/file-viewer.component';
import {
	LanguageSelectorComponent
} from './components/language-components/language-selector/language-selector.component';
import {ApiSelectorComponent} from './components/api-components/api-selector/api-selector.component';
import {FileTranslationComponent} from './components/file-components/file-translation/file-translation.component';
import {FolderTranslationComponent} from './components/folder-components/folder-translation/folder-translation.component';
import {TranslateModule, TranslateService} from '@ngx-translate/core';
import {Title} from '@angular/platform-browser';
import {ApiDetails} from './models/api-details.model';

@Component({
	selector: 'app-root',
	standalone: true,
 imports: [RouterOutlet, CommonModule, FileUploadComponent, FileViewerComponent, LanguageSelectorComponent, ApiSelectorComponent, FileTranslationComponent, FolderTranslationComponent, TranslateModule],
	templateUrl: './app.component.html',
	styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
	title = 'renpy-translation';
	fileContent: string | null = null;
	fileName: string = '';
	selectedApi: string = '';
	apiKey: string = '';
	targetLanguage: string = '';
	folderFiles: File[] = [];

constructor(
		private readonly translateService: TranslateService,
		private readonly titleService: Title
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

	async handleFileSelected(file: File): Promise<void> {
		// Clear any previously selected folder context
		this.folderFiles = [];

		this.fileName = file.name;

		try {
			this.fileContent = await file.text();
		} catch (error) {
			console.error('Error reading file', error);
			this.translateService.get('ERROR_READING_FILE').subscribe((errorMsg: string) => {
				this.fileContent = errorMsg;
			});
		}
	}

	handleApiSelected(apiSettings: ApiDetails): void {
		this.selectedApi = apiSettings.api;
		this.apiKey = apiSettings?.key ?? '';
		this.targetLanguage = apiSettings?.language ?? this.translateService.getDefaultLang();

		console.log('API Settings:', apiSettings);
		// We don't automatically translate when API settings change
		// The user must explicitly request translation
	}


async handleFolderSelected(files: File[]): Promise<void> {
		// If multiple files are provided, treat as folder translation; otherwise leave to single-file flow
		if (!files || files.length === 0) {
			return;
		}
		if (files.length === 1) {
			// Delegate to single-file handler for backward compatibility
			await this.handleFileSelected(files[0]);
			return;
		}

		// Prepare folder translation view, do not translate yet
		this.folderFiles = files;
		// Clear single-file context
		this.fileContent = null;
		this.fileName = '';
	}
}
