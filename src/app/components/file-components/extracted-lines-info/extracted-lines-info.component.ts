import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TranslateModule} from '@ngx-translate/core';

@Component({
	selector: 'app-extracted-lines-info',
	standalone: true,
	imports: [CommonModule, TranslateModule],
	templateUrl: './extracted-lines-info.component.html',
	styleUrl: './extracted-lines-info.component.scss'
})
export class ExtractedLinesInfoComponent {
	@Input() extractedLinesCount: number = 0;
	@Input() extractedLinesCharCount: number = 0;
	@Input() willExceedLimit: boolean = false;
	@Input() willExceedFileLimit: boolean = false;
	@Input() selectedApi: string = '';
	@Input() fileCharLimit: number = 0;
}
