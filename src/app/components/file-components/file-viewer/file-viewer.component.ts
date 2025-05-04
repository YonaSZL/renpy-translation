import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TranslateModule} from '@ngx-translate/core';

@Component({
	selector: 'app-file-viewer',
	standalone: true,
	imports: [CommonModule, TranslateModule],
	templateUrl: './file-viewer.component.html',
	styleUrl: './file-viewer.component.scss'
})
export class FileViewerComponent {
	@Input() fileName: string = '';
	@Input() fileContent: string | null = null;
	isCollapsed = false;

	toggleCollapse(): void {
		this.isCollapsed = !this.isCollapsed;
	}
}
