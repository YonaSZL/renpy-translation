import {Component, ElementRef, EventEmitter, Output, ViewChild} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TranslateModule, TranslateService} from '@ngx-translate/core';

@Component({
	selector: 'app-folder-upload',
	standalone: true,
	imports: [CommonModule, TranslateModule],
	templateUrl: './folder-upload.component.html',
	styleUrls: ['./folder-upload.component.scss']
})
export class FolderUploadComponent {
	isDragOver = false;
	errorMessage = '';
	showError = false;

	@ViewChild('folderInput') folderInput!: ElementRef<HTMLInputElement>;
	@Output() folderSelected = new EventEmitter<File[]>();

	constructor(private readonly translateService: TranslateService) {}

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

	private isRpy(file: File): boolean {
		return file.name.toLowerCase().endsWith('.rpy');
	}

	private emitValidFiles(files: File[]): void {
		const rpyFiles = files.filter(f => this.isRpy(f));
		if (rpyFiles.length === 0) {
			this.translateService.get('ERROR_ONLY_RPY').subscribe((msg: string) => {
				this.errorMessage = msg;
				this.showError = true;
			});
			return;
		}
		this.showError = false;
		this.folderSelected.emit(rpyFiles);
	}

	// Handle dropping a directory (when supported) or multiple files
	onDrop(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.isDragOver = false;
		this.showError = false;

		const items = event.dataTransfer?.items;
		if (items?.length) {
			const entries: any[] = [];
			for (const element of items) {
				const entry = (element as any).webkitGetAsEntry?.();
				if (entry) entries.push(entry);
			}

			if (entries.length) {
				this.readEntries(entries).then(files => this.emitValidFiles(files));
				return;
			}
		}

		// Fallback: accept dropped files
		const files = event.dataTransfer?.files;
		if (files?.length) {
			this.emitValidFiles(Array.from(files));
		}
	}

	private async readEntries(entries: any[]): Promise<File[]> {
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
						for (const entry of batch) {
							if (entry.isFile) {
								entry.file((file: File) => {
									allFiles.push(file);
								});
							} else if (entry.isDirectory) {
								promises.push(readDirectory(entry));
							}
						}
						readBatch();
					});
				};
				readBatch();
			});
		};

		for (const e of entries) {
			if (e.isFile) {
				promises.push(
					new Promise<void>((res) => {
						e.file((file: File) => {
							allFiles.push(file);
							res();
						});
					})
				);
			} else if (e.isDirectory) {
				promises.push(readDirectory(e));
			}
		}

		await Promise.all(promises);
		return allFiles;
	}

	triggerFolderInput(): void {
		this.folderInput.nativeElement.click();
	}

	onFolderSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		this.showError = false;

		if (input.files && input.files.length > 0) {
			this.emitValidFiles(Array.from(input.files));
		}
	}
}
