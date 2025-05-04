import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {TranslateModule} from '@ngx-translate/core';

@Component({
	selector: 'app-api-key-input',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateModule],
	templateUrl: './api-key-input.component.html',
	styleUrl: './api-key-input.component.scss'
})
export class ApiKeyInputComponent {
	@Input() apiKey: string = '';
	@Output() apiKeyChange = new EventEmitter<string>();

	onApiKeyChange(): void {
		this.apiKeyChange.emit(this.apiKey);
	}
}
