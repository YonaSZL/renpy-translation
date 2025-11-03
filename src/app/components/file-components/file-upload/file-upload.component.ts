import {Component, ElementRef, EventEmitter, Output, ViewChild} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TranslateModule, TranslateService} from '@ngx-translate/core';

@Component({
	selector: 'app-file-upload',
	standalone: true,
	imports: [CommonModule, TranslateModule],
	templateUrl: './file-upload.component.html',
	styleUrl: './file-upload.component.scss'
})
export class FileUploadComponent {
	isDragOver = false;
	errorMessage = '';
	showError = false;

	@ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
	@Output() fileSelected = new EventEmitter<File>();
	@Output() filesSelected = new EventEmitter<File[]>();

	constructor(private readonly translateService: TranslateService) {
	}

	private isValidRpyFile(file: File): boolean {
		return file.name.toLowerCase().endsWith('.rpy');
	}

	private emitAccordingToCount(files: File[]): void {
		const rpyFiles = files.filter(f => this.isValidRpyFile(f));
		if (!rpyFiles.length) {
			this.translateService.get('ERROR_ONLY_RPY').subscribe((errorMsg: string) => {
				this.errorMessage = errorMsg;
				this.showError = true;
			});
			return;
		}
		if (rpyFiles.length === 1) {
			this.fileSelected.emit(rpyFiles[0]);
		} else {
			this.filesSelected.emit(rpyFiles);
		}
	}

	onDragOver(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.isDragOver = true;
	}

	onDragLeave(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.isDragOver = false;
	}

	private readEntries(entries: any[]): Promise<File[]> {
		const allFiles: File[] = [];
		const promises: Promise<void>[] = [];

		const readDirectory = (dirEntry: any): Promise<void> => {
			return new Promise((resolve) => {
				const reader = dirEntry.createReader();
				const readBatch = () => {
					reader.readEntries((batch: any[]) => {
						if (!batch.length) {
							resolve();
							return;
						}
						batch.forEach(entry => {
							if (entry.isFile) {
								promises.push(new Promise(res => entry.file((file: File) => { allFiles.push(file); res(); })));
							} else if (entry.isDirectory) {
								promises.push(readDirectory(entry));
							}
						});
						readBatch();
					});
				};
				readBatch();
			});
		};

		entries.forEach(e => {
			if (e.isFile) {
				promises.push(new Promise(res => e.file((file: File) => { allFiles.push(file); res(); })));
			} else if (e.isDirectory) {
				promises.push(readDirectory(e));
			}
		});

		return Promise.all(promises).then(() => allFiles);
	}

	onDrop(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.isDragOver = false;
		this.showError = false;

		const items = event.dataTransfer?.items;
		if (items && items.length) {
			const entries: any[] = [];
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				const entry = (item as any).webkitGetAsEntry?.();
				if (entry) entries.push(entry);
			}

			if (entries.length) {
				this.readEntries(entries).then(files => this.emitAccordingToCount(files));
				return;
			}
		}

		// Fallback: accept dropped files list
		const files = event.dataTransfer?.files;
		if (files && files.length) {
			this.emitAccordingToCount(Array.from(files));
		}
	}

	triggerFileInput(): void {
		this.fileInput.nativeElement.click();
	}

	onFileSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		this.showError = false;

		if (input.files && input.files.length > 0) {
			this.emitAccordingToCount(Array.from(input.files));
		}
	}
}
