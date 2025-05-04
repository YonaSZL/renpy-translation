import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {TranslateModule} from '@ngx-translate/core';
import {ApiDetails} from '../../../models/api-details';

@Component({
	selector: 'app-api-selection',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateModule],
	templateUrl: './api-selection.component.html',
	styleUrl: './api-selection.component.scss'
})
export class ApiSelectionComponent {
	@Input() apis: ApiDetails[] = [];
	@Input() selectedApi: string = '';
	@Output() apiChange = new EventEmitter<string>();

	constructor() {
	}

	onApiChange(): void {
		this.apiChange.emit(this.selectedApi);
	}
}
