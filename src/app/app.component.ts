import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { FileViewerComponent } from './components/file-viewer/file-viewer.component';
import { LanguageSelectorComponent } from './components/language-selector/language-selector.component';
import { ApiSelectorComponent } from './components/api-selector/api-selector.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, FileUploadComponent, FileViewerComponent, LanguageSelectorComponent, ApiSelectorComponent, TranslateModule],
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

  handleApiSelected(apiSettings: {api: string, key: string, language: string}): void {
    this.selectedApi = apiSettings.api;
    this.apiKey = apiSettings.key;
    this.targetLanguage = apiSettings.language;

    console.log('API Settings:', apiSettings);
    // In a real application, you would use these settings to call the translation API
  }
}
