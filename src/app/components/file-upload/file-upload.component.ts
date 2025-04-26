import { Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.css'
})
export class FileUploadComponent {
  isDragOver = false;
  errorMessage = '';
  showError = false;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @Output() fileSelected = new EventEmitter<File>();

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

  isValidRpyFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.rpy');
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    this.showError = false;

    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      if (this.isValidRpyFile(file)) {
        this.fileSelected.emit(file);
      } else {
        this.errorMessage = 'Only .rpy files are allowed.';
        this.showError = true;
      }
    }
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.showError = false;

    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (this.isValidRpyFile(file)) {
        this.fileSelected.emit(file);
      } else {
        this.errorMessage = 'Only .rpy files are allowed.';
        this.showError = true;
        // Reset the file input
        input.value = '';
      }
    }
  }
}
