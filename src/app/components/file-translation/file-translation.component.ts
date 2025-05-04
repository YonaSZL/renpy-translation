import {Component, Input, OnChanges, OnDestroy, signal, SimpleChanges} from '@angular/core';
import {CommonModule, NgIf} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {TranslateModule, TranslateService} from '@ngx-translate/core';
import {DeepLTranslationService} from '../../services/deepl-translation.service';
import {GoogleTranslateService} from '../../services/google-translate.service';
import {catchError, Observable, of} from 'rxjs';

@Component({
	selector: 'app-file-translation',
	standalone: true,
	imports: [
		CommonModule,
		NgIf,
		MatButtonModule,
		MatIconModule,
		TranslateModule
	],
	templateUrl: './file-translation.component.html',
	styleUrls: ['./file-translation.component.css']
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

	// For tracking API usage changes
	private previousCharacterCount: number = 0;
	retryCount = signal<number>(0);
	readonly MAX_RETRY_ATTEMPTS: number = 10;

	// For tracking translation process
	isTranslating = signal<boolean>(false);

	// Countdown timer for API usage update
	countdownValue = signal<number>(5);
	countdownProgress = signal<number>(100);
	private countdownInterval: any = null;

	// Extracted lines information
	extractedLinesCount = signal<number>(0);
	extractedLinesCharCount = signal<number>(0);
	willExceedLimit = signal<boolean>(false);
	willExceedFileLimit = signal<boolean>(false);

	constructor(
		private readonly snackBar: MatSnackBar,
		private readonly deepLTranslationService: DeepLTranslationService,
		private readonly googleTranslateService: GoogleTranslateService,
		private readonly translateService: TranslateService
	) {
	}

	ngOnDestroy(): void {
		this.clearCountdownInterval();
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
			if (this.selectedApi === 'deepl-free' && this.apiKey) {
				this.fetchApiUsage();
			} else if (this.selectedApi === 'google-free') {
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

		// Store the current character count for comparison
		this.previousCharacterCount = this.characterCount();

		// Reset retry count when starting a new check sequence
		if (!this.isUpdatingUsage()) {
			this.retryCount.set(0);
		}

		this.isLoadingUsage.set(true);
		this.usageError.set('');

		if (this.selectedApi === 'deepl-free') {
			this.deepLTranslationService.getUsage(this.apiKey).subscribe({
				next: (response) => {
					this.characterCount.set(response.character_count);
					this.characterLimit.set(response.character_limit);
					this.isLoadingUsage.set(false);

					// Check if the character count has changed
					if (response.character_count === this.previousCharacterCount && this.isUpdatingUsage()) {
						// Count hasn't changed, increment retry count
						this.retryCount.set(this.retryCount() + 1);

						if (this.retryCount() < this.MAX_RETRY_ATTEMPTS) {
							// Schedule another check after 2 seconds
							console.log(`Character count unchanged (${response.character_count}), retrying... (${this.retryCount()}/${this.MAX_RETRY_ATTEMPTS})`);
							setTimeout(() => this.fetchApiUsage(), 2000);
						} else {
							// Max retries reached, stop checking
							console.log(`Max retry attempts (${this.MAX_RETRY_ATTEMPTS}) reached. Stopping checks.`);
							this.isUpdatingUsage.set(false);
							this.snackBar.open(
								this.translateService.instant('MAX_RETRIES_REACHED'),
								this.translateService.instant('CLOSE'),
								{ duration: 3000 }
							);
						}
					} else {
						// Count has changed or we're not in updating mode, stop checking
						this.isUpdatingUsage.set(false);
						if (this.retryCount() > 0) {
							console.log(`Character count updated from ${this.previousCharacterCount} to ${response.character_count} after ${this.retryCount()} retries.`);
						}
					}

					this.checkWillExceedLimit();
				},
				error: (error) => {
					console.error('Error fetching DeepL usage:', error);
					this.usageError.set(this.translateService.instant('ERROR_FETCHING_USAGE'));
					this.isLoadingUsage.set(false);
					this.isUpdatingUsage.set(false);
				}
			});
		} else if (this.selectedApi === 'google-free') {
			this.googleTranslateService.getUsage().subscribe({
				next: (response) => {
					this.characterCount.set(response.character_count);
					this.characterLimit.set(response.character_limit);

					// Set weekly, daily, and file character limits if available
					if (response.weekly_limit) {
						this.weeklyLimit.set(response.weekly_limit);
					}
					if (response.daily_limit) {
						this.dailyLimit.set(response.daily_limit);
					}
					if (response.file_char_limit) {
						this.fileCharLimit.set(response.file_char_limit);
					}

					this.isLoadingUsage.set(false);

					// For Google Translate, we don't need to retry as the data is stored locally
					this.isUpdatingUsage.set(false);

					this.checkWillExceedLimit();
				},
				error: (error) => {
					console.error('Error fetching Google Translate usage:', error);
					this.usageError.set(this.translateService.instant('ERROR_FETCHING_USAGE'));
					this.isLoadingUsage.set(false);
					this.isUpdatingUsage.set(false);
				}
			});
		}
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

		// Calculate character count based on the selected API
		if (this.selectedApi === 'deepl-free') {
			this.extractedLinesCharCount.set(this.deepLTranslationService.calculateCharacterCount(extractedLines));
		} else if (this.selectedApi === 'google-free') {
			this.extractedLinesCharCount.set(this.googleTranslateService.calculateCharacterCount(extractedLines));
		} else {
			// Default to DeepL calculation method
			this.extractedLinesCharCount.set(this.deepLTranslationService.calculateCharacterCount(extractedLines));
		}

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
		const projectedUsage = this.characterCount() + this.extractedLinesCharCount();
		const extractedChars = this.extractedLinesCharCount();

		if (this.selectedApi === 'deepl-free') {
			this.willExceedLimit.set(this.deepLTranslationService.exceedsCharacterLimit(projectedUsage, this.characterLimit()));
			// DeepL doesn't have a file character limit
			this.willExceedFileLimit.set(false);
		} else if (this.selectedApi === 'google-free') {
			// Check API usage limits (monthly, weekly, daily)
			this.willExceedLimit.set(this.googleTranslateService.exceedsCharacterLimit(projectedUsage, this.characterLimit()));

			// Check file character limit separately
			this.willExceedFileLimit.set(this.googleTranslateService.exceedsFileCharacterLimit(extractedChars));
		} else {
			// Default to false if API not recognized
			this.willExceedLimit.set(false);
			this.willExceedFileLimit.set(false);
		}
	}

	extractLines(): string[] {
		if (!this.fileContent) {
			this.snackBar.open(this.translateService.instant('NO_FILE_LOADED'), this.translateService.instant('CLOSE'), {
				duration: 3000,
			});
			return [];
		}

		const lines = this.fileContent.split('\n');
		const linesToTranslate: string[] = [];
		let i = 0;

		while (i < lines.length) {
			const line = lines[i].trim();

			// === TYPE A : Dialogue block ===
			if (line.startsWith('# game/') && lines[i + 1]?.trim().startsWith('translate french')) {
				const comment1 = lines[i + 3]?.trim();
				const comment2 = lines[i + 4]?.trim();

				// Special case: two commented lines (with # and nvl clear or other command)
				if (comment1?.startsWith('#') && comment2?.startsWith('#')) {
					// Check if there's a line to fill after the comments
					if (i + 5 < lines.length) {
						// Check if the first line after the comments is a command without quotes (like "nvl clear")
						const firstLineAfterComments = lines[i + 5].trim();

						// If the first line after the comments doesn't contain quotes, it's a command like "nvl clear"
						if (!firstLineAfterComments.includes('"')) {
							// Check if there's a second line to fill
							if (i + 6 < lines.length) {
								const secondLineAfterComments = lines[i + 6].trim();
								// Check if the second line contains empty quotes (to fill)
								if (secondLineAfterComments.includes('""')) {
									// The second commented line contains the text to translate
									const lineToTranslate = lines[i + 4];
									const textToTranslate = RegExp(/"(.*)"/).exec(lineToTranslate)?.[1] ?? '';
									if (textToTranslate) {
										linesToTranslate.push(textToTranslate);
									}
								}
							}
							i += 7; // Move beyond the block (2 commented lines + 2 lines to fill)
						} else {
							// Standard case: a single line to fill after the comments
							// Check if the line contains empty quotes (to fill)
							if (firstLineAfterComments.includes('""')) {
								// The second commented line contains the text to translate
								const lineToTranslate = lines[i + 4];
								const textToTranslate = RegExp(/"(.*)"/).exec(lineToTranslate)?.[1] ?? '';
								if (textToTranslate) {
									linesToTranslate.push(textToTranslate);
								}
							}
							i += 6; // Move beyond the block (2 commented lines + 1 line to fill)
						}
					} else {
						i += 6; // Move beyond the block if no line to fill
					}
					continue;
				}

				// Classic case: a single commented line
				else if (comment1?.startsWith('#')) {
					// Check if there's a line to fill after the comment
					if (i + 4 < lines.length) {
						const lineToFill = lines[i + 4].trim(); // The line to fill
						// Check if the line contains empty quotes (to fill)
						if (lineToFill.includes('""')) {
							const lineToTranslate = lines[i + 3];
							const textToTranslate = RegExp(/"(.*)"/).exec(lineToTranslate)?.[1] ?? '';
							if (textToTranslate) {
								linesToTranslate.push(textToTranslate);
							}
						}
					}
					i += 5; // Move beyond the block
					continue;
				}

				i += 5;  // Move to the next block if format not recognized
				continue;
			}

			// === TYPE B : Strings block ===
			else if (line.startsWith('translate french strings:')) {
				i++; // Move to the next line

				// Look only for "old" lines followed by empty "new" lines
				while (i < lines.length) {
					const currentLine = lines[i].trim();

					// If we exit the strings block or reach another section
					if (currentLine.startsWith('translate') && !currentLine.includes('strings:')) {
						break;
					}

					// If it's an "old" line
					if (currentLine.startsWith('old "')) {
						// Move to the next line which should be "new"
						const nextIndex = i + 1;
						if (nextIndex < lines.length) {
							const nextLine = lines[nextIndex].trim();
							// Check if it's an empty "new" line
							if (nextLine.startsWith('new "') && (nextLine === 'new ""' || nextLine.endsWith('""'))) {
								const oldMatch = RegExp(/old\s+"([^"]+)"/).exec(currentLine);
								const textToTranslate = oldMatch?.[1] ?? '';
								if (textToTranslate) {
									linesToTranslate.push(textToTranslate);
								}
							}
						}
					}

					i++; // Move to the next line
				}
				continue;
			}

			i++; // Move to the next line
		}

		return linesToTranslate;
	}

	extractCommand(line: string): string {
		// Remove spaces and comment if present at the beginning
		const cleanedLine = line.trim().replace(/^#\s*/, '');  // Remove # if present at the beginning of the line

		// Use RegExp to capture the command before the quotes
		const match = RegExp(/^([^"]+)\s*"/).exec(cleanedLine);

		if (match) {
			// match[1]: it's the command we want to extract
			return match[1].trim(); // Return only the command (e.g., "sh_i neutral")
		}

		// If the line doesn't match the expected format, try to extract a command anyway
		// This can happen with lines like "nvl clear" that don't have quotes
		const fallbackMatch = cleanedLine.split(/\s+/);
		if (fallbackMatch.length > 0) {
			return fallbackMatch[0]; // Return the first word as the command
		}

		return ''; // If no command is found, return an empty string
	}

	findLinesToFill(): string[] {
		if (!this.fileContent) {
			this.snackBar.open(this.translateService.instant('NO_FILE_LOADED'), this.translateService.instant('CLOSE'), {
				duration: 3000,
			});
			return [];
		}

		const lines = this.fileContent.split('\n');
		const linesToFill: string[] = [];
		let i = 0;

		while (i < lines.length) {
			let line = lines[i].trim();

			// === TYPE A : Dialogue block ===
			if (line.startsWith('# game/') && lines[i + 1]?.trim().startsWith('translate french')) {
				const comment1 = lines[i + 3]?.trim();
				const comment2 = lines[i + 4]?.trim();

				// Special case: two commented lines (with # and nvl clear or other command)
				if (comment1?.startsWith('#') && comment2?.startsWith('#')) {
					// Check if there's a line to fill after the comments
					if (i + 5 < lines.length) {
						// Check if the first line after the comments is a command without quotes (like "nvl clear")
						const firstLineAfterComments = lines[i + 5].trim();

						// If the first line after the comments doesn't contain quotes, it's a command like "nvl clear"
						if (!firstLineAfterComments.includes('"')) {
							// Check if there's a second line to fill
							if (i + 6 < lines.length) {
								const secondLineAfterComments = lines[i + 6].trim();
								// Check if the second line contains empty quotes (to fill)
								if (secondLineAfterComments.includes('""')) {
									// Extract the command to reuse
									const command = this.extractCommand(lines[i + 4]);
									if (command) {
										linesToFill.push(`${command} ""`);
									}
								}
							}
							i += 7; // Move beyond the block (2 commented lines + 2 lines to fill)
						} else {
							// Standard case: a single line to fill after the comments
							// Check if the line contains empty quotes (to fill)
							if (firstLineAfterComments.includes('""')) {
								// Extract the command to reuse
								const command = this.extractCommand(lines[i + 4]);
								if (command) {
									linesToFill.push(`${command} ""`);
								}
							}
							i += 6; // Move beyond the block (2 commented lines + 1 line to fill)
						}
					} else {
						i += 6; // Move beyond the block if no line to fill
					}
					continue;
				}

				// Classic case: a single commented line
				else if (comment1?.startsWith('#')) {
					// Check if there's a line to fill after the comment
					if (i + 4 < lines.length) {
						const lineToFill = lines[i + 4].trim(); // The line to fill
						// Check if the line contains empty quotes (to fill)
						if (lineToFill.includes('""')) {
							// Extract the command to reuse
							const command = this.extractCommand(lines[i + 3]);
							if (command) {
								linesToFill.push(`${command} ""`);
							}
						}
					}
					i += 5; // Move beyond the block
					continue;
				}

				i += 5;  // Move to the next block if format not recognized
				continue;
			}

			// === TYPE B : Strings block ===
			else if (line.startsWith('translate french strings:')) {
				i++;

				while (i < lines.length) {
					const currentLine = lines[i].trim();

					// If we exit the strings block or reach another section
					if (currentLine.startsWith('translate') && !currentLine.includes('strings:')) {
						break;
					}

					// If it's an "old" line
					if (currentLine.startsWith('old "')) {
						// Extract the "old" text for reference
						RegExp(/old\s+"([^"]+)"/).exec(currentLine);
						// Move to the next line which should be "new"
						i++;
						if (i < lines.length) {
							const nextLine = lines[i].trim();
							// Check if it's an empty "new" line
							if (nextLine.startsWith('new "') && (nextLine === 'new ""' || nextLine.endsWith('""'))) {
								linesToFill.push(`new ""`);
							}
						}
					} else {
						i++; // Move to the next line if it's not an "old" line
					}
				}
				continue;
			}

			i++;
		}

		return linesToFill;
	}

	translateLines(linesToTranslate: string[]): Observable<string[]> {
		if (!linesToTranslate || linesToTranslate.length === 0) {
			return of([]);  // If no lines, return an empty array
		}

		// Call translateMultiple with all lines to translate based on the selected API
		if (this.selectedApi === 'deepl-free') {
			return this.deepLTranslationService.translateMultiple(linesToTranslate, this.apiKey, this.targetLanguage).pipe(
				catchError(err => {
					console.error('DeepL translation error:', err);
					this.snackBar.open(this.translateService.instant('TRANSLATION_ERROR'), this.translateService.instant('CLOSE'), {
						duration: 3000,
					});
					return of([]);  // Return an empty array in case of error
				})
			);
		} else if (this.selectedApi === 'google-free') {
			return this.googleTranslateService.translateMultiple(linesToTranslate, this.targetLanguage).pipe(
				catchError(err => {
					console.error('Google Translate error:', err);
					this.snackBar.open(this.translateService.instant('TRANSLATION_ERROR'), this.translateService.instant('CLOSE'), {
						duration: 3000,
					});
					return of([]);  // Return an empty array in case of error
				})
			);
		} else {
			// Default to DeepL if API not recognized
			console.error('Unknown API selected:', this.selectedApi);
			this.snackBar.open(this.translateService.instant('UNKNOWN_API_ERROR'), this.translateService.instant('CLOSE'), {
				duration: 3000,
			});
			return of([]);  // Return an empty array in case of error
		}
	}

	createFilledLines(linesToFill: string[], translatedLines: string[]): string[] {
		const filledLines: string[] = [];

		// Check if the arrays have different lengths
		if (linesToFill.length !== translatedLines.length) {
			console.warn(`Warning: Number of lines to fill (${linesToFill.length}) different from number of translated lines (${translatedLines.length})`);
		}

		// Make sure we have the same number of elements in both arrays
		const minLength = Math.min(linesToFill.length, translatedLines.length);

		for (let i = 0; i < minLength; i++) {
			const lineToFill = linesToFill[i];
			const translatedText = translatedLines[i];

			// Extract the command from the line to fill
			const commandMatch = RegExp(/^([^"]+)/).exec(lineToFill);
			const command = commandMatch ? commandMatch[1].trim() : '';

			// Create the new line with the translation
			if (command.startsWith('new')) {
				// Type B: Strings block
				const filledLine = `${command} "${translatedText}"`;
				filledLines.push(filledLine);
			} else {
				// Type A: Dialogue block
				const filledLine = `${command} "${translatedText}"`;
				filledLines.push(filledLine);
			}
		}

		return filledLines;
	}

	findFilledLineIndex(filledLines: (string | null)[], command: string, startIndex: number = 0): number {
		for (let i = startIndex; i < filledLines.length; i++) {
			// Ignore lines already used (marked as null)
			if (filledLines[i] === null) {
				continue;
			}

			// We know filledLines[i] is not null at this point
			const filledLine = filledLines[i]!;
			const filledLineCommand = filledLine.split('"')[0].trim();
			if (filledLineCommand === command) {
				return i;
			}
		}

		// If we didn't find a line with the exact command, look for a line with "new" for Type B cases
		if (command === "new") {
			return -1; // Already looked for "new", not found
		}

		// If we didn't find a line with the exact command, take the first available line
		for (let i = 0; i < filledLines.length; i++) {
			if (filledLines[i] !== null) {
				return i;
			}
		}

		return -1; // Not found
	}

	replaceLines(filledLines: string[]): void {
		if (!this.fileContent) {
			return;
		}

		const lines = this.fileContent.split('\n');
		const outputLines: string[] = [];
		let i = 0;

		// Create a copy of the filled lines to mark them as used
		const availableFilledLines: (string | null)[] = [...filledLines];

		while (i < lines.length) {
			const line = lines[i].trim();

			// === TYPE A : Dialogue block ===
			if (line.startsWith('# game/') && lines[i + 1]?.trim().startsWith('translate french')) {
				// Add the header lines of the block
				outputLines.push(lines[i]);     // # game/...
				outputLines.push(lines[i + 1]); // translate french...
				outputLines.push(lines[i + 2] || ''); // empty line

				const comment1 = lines[i + 3]?.trim();
				const comment2 = lines[i + 4]?.trim();

				// Special case: two commented lines (with # and nvl clear or other command)
				if (comment1?.startsWith('#') && comment2?.startsWith('#')) {
					// Add the commented lines as they are
					outputLines.push(lines[i + 3]); // First commented line
					outputLines.push(lines[i + 4]); // Second commented line (contains the text to translate)

					// Check if there's a line to fill after the comments
					if (i + 5 < lines.length) {
						// Check if the first line after the comments is a command without quotes (like "nvl clear")
						const firstLineAfterComments = lines[i + 5].trim();

						// If the first line after the comments doesn't contain quotes, it's a command like "nvl clear"
						if (!firstLineAfterComments.includes('"')) {
							// Add the first line as is (command without quotes)
							outputLines.push(lines[i + 5]);

							// Check if there's a second line to fill
							if (i + 6 < lines.length) {
								const secondLineAfterComments = lines[i + 6].trim();
								// Check if the second line contains empty quotes (to fill)
								if (secondLineAfterComments.includes('""')) {
									// Extract the command from the line to fill
									const commandToFill = this.extractCommand(lines[i + 6]);

									// Look for a filled line with the same command
									const matchingIndex = this.findFilledLineIndex(availableFilledLines, commandToFill, 0);

									if (matchingIndex !== -1) {
										// Use the found filled line
										const filledLine = availableFilledLines[matchingIndex]!;
										outputLines.push(`    ${filledLine}`);

										// Mark the line as used by replacing it with null
										availableFilledLines[matchingIndex] = null;
									} else {
										// If no corresponding filled line, keep the original line
										outputLines.push(lines[i + 6]);
									}
								} else {
									// If the line already has a translation, keep it as is
									outputLines.push(lines[i + 6]);
								}
							} else {
								// If no second line to fill, add an empty line
								outputLines.push('');
							}

							i += 7; // Move beyond the block (2 commented lines + 2 lines to fill)
						} else {
							// Standard case: a single line to fill after the comments
							// Check if the line contains empty quotes (to fill)
							if (firstLineAfterComments.includes('""')) {
								// Extract the command from the line to fill
								const commandToFill = this.extractCommand(lines[i + 5]);

								// Look for a filled line with the same command
								const matchingIndex = this.findFilledLineIndex(availableFilledLines, commandToFill, 0);

								if (matchingIndex !== -1) {
									// Use the found filled line
									const filledLine = availableFilledLines[matchingIndex]!;
									outputLines.push(`    ${filledLine}`);

									// Mark the line as used by replacing it with null
									availableFilledLines[matchingIndex] = null;
								} else {
									// If no corresponding filled line, keep the original line
									outputLines.push(lines[i + 5]);
								}
							} else {
								// If the line already has a translation, keep it as is
								outputLines.push(lines[i + 5]);
							}

							i += 6; // Move beyond the block (2 commented lines + 1 line to fill)
						}
					} else {
						// If no line to fill, add an empty line
						outputLines.push('');
						i += 6; // Move beyond the block
					}

					continue;
				}

				// Classic case: a single commented line
				if (comment1?.startsWith('#')) {
					// Add the commented line as is
					outputLines.push(lines[i + 3]); // commented line

					// Check if there's a line to fill after the comment
					if (i + 4 < lines.length) {
						const lineToFill = lines[i + 4].trim(); // The line to fill

						// Check if the line contains empty quotes (to fill)
						if (lineToFill.includes('""')) {
							// Extract the command from the line to fill
							const commandToFill = this.extractCommand(lines[i + 4]);

							// Look for a filled line with the same command
							const matchingIndex = this.findFilledLineIndex(availableFilledLines, commandToFill, 0);

							if (matchingIndex !== -1) {
								// Use the found filled line
								const filledLine = availableFilledLines[matchingIndex]!;
								outputLines.push(`    ${filledLine}`);

								// Mark the line as used by replacing it with null
								availableFilledLines[matchingIndex] = null;
							} else {
								// If no corresponding filled line, keep the original line
								outputLines.push(lines[i + 4]);
							}
						} else {
							// If the line already has a translation, keep it as is
							outputLines.push(lines[i + 4]);
						}
					} else {
						// If no line to fill, add an empty line
						outputLines.push('');
					}

					i += 5;  // Move to the next block
					continue;
				}

				// Unrecognized format: copy the lines as they are
				if (lines[i + 3]) outputLines.push(lines[i + 3]);
				if (lines[i + 4]) outputLines.push(lines[i + 4]);
				i += 5;  // Move to the next block
				continue;
			}

			// === TYPE B : Strings block ===
			else if (line.startsWith('translate french strings:')) {
				outputLines.push(line);
				i++;

				while (i < lines.length && (lines[i].trim().startsWith('old "') || lines[i].trim() === '')) {
					outputLines.push(lines[i]); // Keep the old line as is
					i++;

					if (i < lines.length) {
						const nextLine = lines[i]?.trim();

						// Check if it's an empty "new" line
						if (nextLine && nextLine.startsWith('new "') && (nextLine === 'new ""' || nextLine.endsWith('""'))) {
							// For "new" lines, we just extract "new" as the command
							const commandToFill = "new";

							// Look for a filled line with the same command
							const matchingIndex = this.findFilledLineIndex(availableFilledLines, commandToFill, 0);

							if (matchingIndex !== -1) {
								// Use the found filled line
								const filledLine = availableFilledLines[matchingIndex]!;
								outputLines.push(`    ${filledLine}`);

								// Mark the line as used by replacing it with null
								availableFilledLines[matchingIndex] = null;
							} else {
								// If no corresponding filled line, keep the original line
								outputLines.push(lines[i]);
							}
						} else {
							// If the line already has a translation, keep it as is
							outputLines.push(lines[i] || '');
						}
					}

					i++;
				}
				continue;
			}

			// Other lines - copy them as they are
			outputLines.push(lines[i]);
			i++;
		}

		// Generate and download the file after replacing the translated lines
		this.generateTranslationFile(outputLines.join('\n'));
	}

	generateTranslationFile(content: string): void {
		const blob = new Blob([content], {type: 'text/plain'});
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
					if (this.selectedApi === 'deepl-free') {
						// Show notification that usage will update
						this.snackBar.open(this.translateService.instant('USAGE_UPDATE_NOTICE'), this.translateService.instant('CLOSE'), {
							duration: 5000,
						});
						// Start countdown for API usage update
						this.startCountdown();
					} else if (this.selectedApi === 'google-free') {
						// For Google Translate, update usage information immediately
						this.fetchApiUsage();
						// Show notification that usage has been updated
						this.snackBar.open(this.translateService.instant('GOOGLE_USAGE_UPDATED'), this.translateService.instant('CLOSE'), {
							duration: 3000,
						});
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
}
