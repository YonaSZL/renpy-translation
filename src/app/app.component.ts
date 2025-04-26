import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { FileViewerComponent } from './components/file-viewer/file-viewer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, FileUploadComponent, FileViewerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'renpy-translation';
  fileContent: string | null = null;
  fileName: string = '';

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
      this.fileContent = 'Error reading file. Please try again.';
    };

    reader.readAsText(file);
  }
}
