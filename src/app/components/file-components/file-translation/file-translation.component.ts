import {Component, Input, OnChanges, OnDestroy, signal, SimpleChanges} from '@angular/core';
import {CommonModule, NgIf} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {TranslateModule, TranslateService} from '@ngx-translate/core';
import {ApiUsageResult, TranslationApiService} from '../../../services/translation-api.service';
import {RenpyFileParserService} from '../../../services/renpy-file-parser.service';
import {TranslationProcessorService} from '../../../services/translation-processor.service';
import {catchError, map, Observable, of} from 'rxjs';
import {ApiUsageInfoComponent} from '../../api-components/api-usage-info/api-usage-info.component';
import {ExtractedLinesInfoComponent} from '../extracted-lines-info/extracted-lines-info.component';

@Component({
	selector: 'app-file-translation',
	standalone: true,
	imports: [
		CommonModule,
		NgIf,
		MatButtonModule,
		MatIconModule,
		TranslateModule,
		ApiUsageInfoComponent,
		ExtractedLinesInfoComponent
	],
	templateUrl: './file-translation.component.html',
	styleUrls: ['./file-translation.component.scss']
})
export class FileTranslationComponent implements OnChanges, OnDestroy {
	@Input() fileContent: string | null = '';
	@Input() fileName: string = '';
	@Input() apiKey: string = '';
	@Input() targetLanguage: string = '';
	@Input() selectedApi: string = '';

	translationFileName = signal<string>('');
	isApiConfigured = signal<boolean>(false);

	// API usage information
	characterCount = signal<number>(0);
	characterLimit = signal<number>(0);
	weeklyLimit = signal<number>(0);
	dailyLimit = signal<number>(0);
	fileCharLimit = signal<number>(0);
	isLoadingUsage = signal<boolean>(false);
	isUpdatingUsage = signal<boolean>(false);
	usageError = signal<string>('');
	retryCount = signal<number>(0);
	readonly MAX_RETRY_ATTEMPTS: number = 10;
	// For tracking translation process
	isTranslating = signal<boolean>(false);
	// Countdown timer for API usage update
	countdownValue = signal<number>(5);
	countdownProgress = signal<number>(100);
	// Extracted lines information
	extractedLinesCount = signal<number>(0);
	extractedLinesCharCount = signal<number>(0);
	willExceedLimit = signal<boolean>(false);
	willExceedFileLimit = signal<boolean>(false);
	// For tracking API usage changes
	private previousCharacterCount: number = 0;
	private countdownInterval: any = null;

	constructor(
		private readonly snackBar: MatSnackBar,
		private readonly translateService: TranslateService,
		private readonly translationApiService: TranslationApiService,
		private readonly renpyFileParserService: RenpyFileParserService,
		private readonly translationProcessorService: TranslationProcessorService
	) {
	}

	ngOnDestroy(): void {
		this.clearCountdownInterval();
	}

	ngOnChanges(changes: SimpleChanges): void {
		// Check if API is configured
		// For DeepL API, we need an API key
		const isConfigured = !!(this.selectedApi && this.targetLanguage) &&
			(this.selectedApi !== 'deepl-free' || !!this.apiKey);
		this.isApiConfigured.set(isConfigured);

		// Update translation file name when file name changes
		if (changes['fileName'] && this.fileName) {
			this.translationFileName.set(`to_translate_${this.fileName}`);
		}

		// Fetch API usage information when API key changes or API is selected
		if (changes['apiKey'] || changes['selectedApi']) {
			if ((this.selectedApi === 'deepl-free' && this.apiKey) || this.selectedApi === 'google-free') {
				this.fetchApiUsage();
			}
		}

		// Update extracted lines information when file content changes
		if (changes['fileContent'] && this.fileContent) {
			this.updateExtractedLinesInfo();
		}
	}

	/**
	 * Fetch API usage information from the selected API
	 * If the character count hasn't changed, it will retry up to MAX_RETRY_ATTEMPTS times
	 */
	fetchApiUsage(): void {
		if (this.selectedApi === 'deepl-free' && !this.apiKey) {
			return;
		}

		this.setupApiUsageFetch();

		this.translationApiService.fetchApiUsage(
			this.selectedApi,
			this.apiKey,
			this.previousCharacterCount,
			this.retryCount(),
			this.MAX_RETRY_ATTEMPTS
		).subscribe({
			next: (result) => this.handleApiUsageResult(result),
			error: (error) => this.handleApiUsageError(error)
		});
	}

	/**
	 * Update information about extracted lines
	 */
	updateExtractedLinesInfo(): void {
		if (!this.fileContent) {
			this.extractedLinesCount.set(0);
			this.extractedLinesCharCount.set(0);
			this.willExceedLimit.set(false);
			return;
		}

		const extractedLines = this.extractLines();
		this.extractedLinesCount.set(extractedLines.length);

		// Calculate character count using the translation API service
		this.extractedLinesCharCount.set(
			this.translationApiService.calculateCharacterCount(this.selectedApi, extractedLines)
		);

		this.checkWillExceedLimit();
	}

	/**
	 * Check if the translation will exceed the API limit
	 */
	checkWillExceedLimit(): void {
		if (!this.characterLimit()) {
			this.willExceedLimit.set(false);
			return;
		}

		// Check if current usage plus new translation will exceed the limit
		const currentCount = this.characterCount();
		const additionalCount = this.extractedLinesCharCount();

		const result = this.translationApiService.checkWillExceedLimit(
			this.selectedApi,
			currentCount,
			additionalCount,
			this.characterLimit()
		);

		this.willExceedLimit.set(result.willExceedLimit);
		this.willExceedFileLimit.set(result.willExceedFileLimit);
	}

	/**
	 * Extracts lines that need to be translated from the file content
	 * @returns Array of strings to be translated
	 */
	extractLines(): string[] {
		if (!this.fileContent) {
			this.snackBar.open(this.translateService.instant('NO_FILE_LOADED'), this.translateService.instant('CLOSE'), {
				duration: 3000,
			});
			return [];
		}

		return this.renpyFileParserService.extractLines(this.fileContent);
	}

	extractCommand(line: string): string {
		return this.renpyFileParserService.extractCommand(line);
	}

	/**
	 * Finds lines in the file content that need to be filled with translations
	 * @returns Array of strings to be filled with translations
	 */
	findLinesToFill(): string[] {
		if (!this.fileContent) {
			this.snackBar.open(this.translateService.instant('NO_FILE_LOADED'), this.translateService.instant('CLOSE'), {
				duration: 3000,
			});
			return [];
		}

		return this.renpyFileParserService.findLinesToFill(this.fileContent);
	}

	translateLines(linesToTranslate: string[]): Observable<string[]> {
		if (!linesToTranslate || linesToTranslate.length === 0) {
			return of([]);  // If no lines, return an empty array
		}

		// Use the translation API service to translate the lines
		return this.translationApiService.translateTexts(
			this.selectedApi,
			linesToTranslate,
			this.targetLanguage,
			this.apiKey
		).pipe(
			map(result => {
				if (result.error) {
					// Handle error
					console.error(`Translation error: ${result.error}`);
					this.snackBar.open(this.translateService.instant('TRANSLATION_ERROR'), this.translateService.instant('CLOSE'), {
						duration: 3000,
					});
					return [];  // Return an empty array in case of error
				}
				return result.translatedTexts;
			}),
			catchError(err => {
				console.error(`Error in translateLines: ${err}`);
				this.snackBar.open(this.translateService.instant('TRANSLATION_ERROR'), this.translateService.instant('CLOSE'), {
					duration: 3000,
				});
				return of([]);  // Return an empty array in case of error
			})
		);
	}

	createFilledLines(linesToFill: string[], translatedLines: string[]): string[] {
		return this.translationProcessorService.createFilledLines(linesToFill, translatedLines);
	}


	/**
	 * Replace empty lines in the file content with translated lines
	 * @param filledLines Array of strings with translations to fill in the file
	 */
	replaceLines(filledLines: string[]): void {
		if (!this.fileContent) {
			return;
		}

		// Use the translation processor service to replace lines
		const newContent = this.translationProcessorService.replaceLines(
			this.fileContent,
			filledLines,
			(line) => this.extractCommand(line)
		);

		// Generate and download the file after replacing the translated lines
		this.generateTranslationFile(newContent);
	}

	generateTranslationFile(content: string): void {
		const blob = this.translationProcessorService.generateTranslationFile(content);
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = this.translationFileName();
		document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(url);
		document.body.removeChild(a);

		this.snackBar.open(this.translateService.instant('FILE_GENERATED_SUCCESS'), this.translateService.instant('CLOSE'), {
			duration: 3000,
		});
	}

	translateFile(): void {
		if (!this.fileContent) {
			this.snackBar.open(this.translateService.instant('NO_FILE_LOADED'), this.translateService.instant('CLOSE'), {
				duration: 3000,
			});
			return;
		}

		// Set translating state to true
		this.isTranslating.set(true);

		try {
			// Use existing methods to get the three arrays
			const extractedLines = this.extractLines(); // Content to extract (between quotes)
			const linesToFill = this.findLinesToFill(); // Lines to fill

			// Check that we have lines to translate
			if (extractedLines.length === 0) {
				this.snackBar.open(this.translateService.instant('NO_LINES_TO_TRANSLATE'), this.translateService.instant('CLOSE'), {
					duration: 3000,
				});
				this.isTranslating.set(false);
				return;
			}

			// We don't need to check for willExceedLimit() here anymore
			// since the button is disabled when limits are exceeded

			// Translate the extracted lines
			this.translateLines(extractedLines).subscribe({
				next: (translatedLines) => {
					// Create an array for the new filled lines
					const filledLines = this.createFilledLines(linesToFill, translatedLines);

					// Replace the lines in the file
					this.replaceLines(filledLines);

					// Update usage information after translation
					const updateInfo = this.translationApiService.updateUsageAfterTranslation(this.selectedApi);

					// Show notification
					this.snackBar.open(this.translateService.instant(updateInfo.message), this.translateService.instant('CLOSE'), {
						duration: updateInfo.needsCountdown ? 5000 : 3000,
					});

					// Start countdown or fetch usage immediately
					if (updateInfo.needsCountdown) {
						this.startCountdown();
					} else {
						this.fetchApiUsage();
					}

					// Set translating state to false
					this.isTranslating.set(false);
				},
				error: (err) => {
					console.error('Translation error:', err);
					this.snackBar.open(this.translateService.instant('TRANSLATION_ERROR'), this.translateService.instant('CLOSE'), {
						duration: 3000,
					});

					// Set translating state to false
					this.isTranslating.set(false);
				}
			});
		} catch (error) {
			this.snackBar.open(this.translateService.instant('ERROR_REINTEGRATING_LINES'), this.translateService.instant('CLOSE'), {
				duration: 3000,
			});
			console.error(error);

			// Set translating state to false
			this.isTranslating.set(false);
		}
	}

	/**
	 * Setup state for API usage fetch
	 */
	private setupApiUsageFetch(): void {
		// Store the current character count for comparison
		this.previousCharacterCount = this.characterCount();

		// Reset retry count when starting a new check sequence
		if (!this.isUpdatingUsage()) {
			this.retryCount.set(0);
		}

		this.isLoadingUsage.set(true);
		this.usageError.set('');
	}

	/**
	 * Handle API usage result
	 * @param result The API usage result
	 */
	private handleApiUsageResult(result: ApiUsageResult): void {
		this.updateCharacterLimits(result);

		// Handle retry logic for DeepL
		if (result.shouldRetry && result.retryCount !== undefined) {
			this.handleRetry(result);
		} else {
			this.handleFetchComplete(result);
		}

		this.checkWillExceedLimit();
	}

	/**
	 * Update character limits from API usage result
	 * @param result The API usage result
	 */
	private updateCharacterLimits(result: ApiUsageResult): void {
		// Update character count and limit
		this.characterCount.set(result.character_count);
		this.characterLimit.set(result.character_limit);
		this.isLoadingUsage.set(false);

		// Set weekly, daily, and file character limits if available (for Google Translate)
		if (result.weekly_limit) {
			this.weeklyLimit.set(result.weekly_limit);
		}
		if (result.daily_limit) {
			this.dailyLimit.set(result.daily_limit);
		}
		if (result.file_char_limit) {
			this.fileCharLimit.set(result.file_char_limit);
		}
	}

	/**
	 * Handle retry logic for DeepL
	 * @param result The API usage result
	 */
	private handleRetry(result: ApiUsageResult): void {
		// Update retry count
		this.retryCount.set(result.retryCount!);

		// Schedule another check after 2 seconds
		console.log(`Character count unchanged (${result.character_count}), retrying... (${result.retryCount}/${this.MAX_RETRY_ATTEMPTS})`);
		setTimeout(() => this.fetchApiUsage(), 2000);
	}

	/**
	 * Handle completion of API usage fetch
	 * @param result The API usage result
	 */
	private handleFetchComplete(result: ApiUsageResult): void {
		// No need to retry or max retries reached
		this.isUpdatingUsage.set(false);

		if (this.retryCount() > 0 && result.previousCharacterCount !== undefined) {
			console.log(`Character count updated from ${result.previousCharacterCount} to ${result.character_count} after ${this.retryCount()} retries.`);
		}

		// If max retries reached, show a message
		if (result.retryCount !== undefined && result.retryCount >= this.MAX_RETRY_ATTEMPTS) {
			console.log(`Max retry attempts (${this.MAX_RETRY_ATTEMPTS}) reached. Stopping checks.`);
			this.snackBar.open(
				this.translateService.instant('MAX_RETRIES_REACHED'),
				this.translateService.instant('CLOSE'),
				{duration: 3000}
			);
		}
	}

	/**
	 * Handle API usage fetch error
	 * @param error The error
	 */
	private handleApiUsageError(error: any): void {
		console.error(`Error fetching ${this.selectedApi} usage:`, error);
		this.usageError.set(this.translateService.instant('ERROR_FETCHING_USAGE'));
		this.isLoadingUsage.set(false);
		this.isUpdatingUsage.set(false);
	}

	/**
	 * Clear the countdown interval if it exists
	 */
	private clearCountdownInterval(): void {
		if (this.countdownInterval) {
			clearInterval(this.countdownInterval);
			this.countdownInterval = null;
		}
	}

	/**
	 * Start the countdown timer for API usage update
	 */
	private startCountdown(): void {
		// Reset countdown values
		this.countdownValue.set(5);
		this.countdownProgress.set(100);
		this.isUpdatingUsage.set(true);
		this.retryCount.set(0);

		// Clear any existing interval
		this.clearCountdownInterval();

		// Start a new interval
		this.countdownInterval = setInterval(() => {
			const currentValue = this.countdownValue();
			if (currentValue <= 0) {
				// Countdown finished, fetch API usage
				this.clearCountdownInterval();
				// Keep isUpdatingUsage true for the retry phase
				this.fetchApiUsage();
			} else {
				// Update countdown values
				this.countdownValue.set(currentValue - 1);
				// Calculate progress: 5s=100%, 4s=80%, 3s=60%, 2s=40%, 1s=20%, 0s=0%
				this.countdownProgress.set(currentValue * 20);
			}
		}, 1000); // Update every second
	}

}
