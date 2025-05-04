import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {TranslateModule} from '@ngx-translate/core';
import {SupportedLanguage} from '../../../models/supported-language.model';
import {LanguageLocalizationService} from '../../../services/language-localization.service';

@Component({
	selector: 'app-language-selection',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateModule],
	templateUrl: './language-selection.component.html',
	styleUrl: './language-selection.component.scss'
})
export class LanguageSelectionComponent {
	@Input() availableLanguages: SupportedLanguage[] = [];
	@Input() selectedLanguage: string = '';
	@Input() currentPageLanguage: string = '';
	@Input() isLoading: boolean = false;
	@Input() errorMessage: string = '';
	@Output() languageChange = new EventEmitter<string>();

	constructor(
		public readonly languageLocalizationService: LanguageLocalizationService
	) {
	}

	onLanguageChange(): void {
		this.languageChange.emit(this.selectedLanguage);
	}
}
