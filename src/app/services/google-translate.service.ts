import {Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {forkJoin, Observable, of, throwError} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {SupportedLanguage} from '../models/supported-language.model';

interface TranslationBatch {
	timestamp: number;
	character_count: number;
}

interface GoogleTranslateUsage {
	character_count: number;
	character_limit: number;
	weekly_limit?: number;
	daily_limit?: number;
	file_char_limit?: number;
	translation_batches?: TranslationBatch[];
	daily_count?: number;
	weekly_count?: number;
}

export interface GoogleTranslateUsageResult {
	character_count: number;
	character_limit: number;
	weekly_limit?: number;
	daily_limit?: number;
	file_char_limit?: number;
	daily_count?: number;
	weekly_count?: number;
	monthly_count?: number;
	translation_batches?: TranslationBatch[];
	error?: string;
}

@Injectable({
	providedIn: 'root'
})
export class GoogleTranslateService {
	// Google Translate API limits (manually set)
	readonly GOOGLE_TRANSLATE_CHAR_LIMIT = 500000; // 500,000 characters per month
	readonly GOOGLE_TRANSLATE_WEEKLY_LIMIT = Math.floor(500000 / 4.3); // Weekly limit (monthly / 4.3)
	readonly GOOGLE_TRANSLATE_DAILY_LIMIT = Math.floor((500000 / 4.3) / 7); // Daily limit (weekly / 7)
	readonly GOOGLE_TRANSLATE_FILE_CHAR_LIMIT = 5000; // 5,000 characters per file
	// Using the undocumented Google Translate API directly
	private readonly API_URL = 'https://translate.googleapis.com/translate_a/single';
	private readonly LANGUAGES_URL = 'https://translate.googleapis.com/translate_a/l';
	private readonly LOCAL_STORAGE_KEY = 'google_translate_usage';

	constructor(private readonly httpClient: HttpClient) {
		// Initialize usage data if it doesn't exist or reset it if limits have changed
		const usage = this.getUsageFromLocalStorage();
		if (!usage || usage.character_limit !== this.GOOGLE_TRANSLATE_CHAR_LIMIT) {
			this.resetUsageInLocalStorage();
		}
	}

	/**
	 * Reset usage information in local storage with current limits
	 * This is useful when the limits have changed
	 */
	resetUsageInLocalStorage(): void {
		// Keep the current translation batches if they exist
		const currentUsage = this.getUsageFromLocalStorage();
		const translationBatches = currentUsage?.translation_batches || [];

		// Save with updated limits
		this.saveUsageToLocalStorage({
			character_count: 0, // Will be recalculated based on batches
			character_limit: this.GOOGLE_TRANSLATE_CHAR_LIMIT,
			weekly_limit: this.GOOGLE_TRANSLATE_WEEKLY_LIMIT,
			daily_limit: this.GOOGLE_TRANSLATE_DAILY_LIMIT,
			file_char_limit: this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT,
			translation_batches: translationBatches
		});
	}

	/**
	 * Translate text using the undocumented Google Translate API
	 * @param text The text to translate
	 * @param targetLang The target language code
	 * @param sourceLang The source language code (default: 'auto' for auto-detection)
	 * @returns Observable of the translated text
	 */
	translate(text: string, targetLang: string, sourceLang: string = 'auto'): Observable<string> {
		// Build the query parameters
		const params = new HttpParams()
			.set('client', 'gtx')
			.set('sl', sourceLang)
			.set('tl', targetLang)
			.set('dt', 't')
			.set('q', text);

		// Make the request to the API
		return this.httpClient.get<any>(`${this.API_URL}?${params.toString()}`)
			.pipe(
				map(response => {
					// The response format is a nested array: [[["translated text","original text",null,null,1]]]
					if (response && Array.isArray(response) && response.length > 0 &&
						Array.isArray(response[0]) && response[0].length > 0) {

						// Extract all translated parts and join them
						let translatedText = '';
						for (const part of response[0]) {
							if (Array.isArray(part) && part.length > 0) {
								translatedText += part[0];
							}
						}
						return translatedText;
					}
					throw new Error('Unexpected response format from Google Translate API');
				}),
				catchError(error => {
					console.error('Error translating text with Google Translate:', error);
					return throwError(() => new Error('Failed to translate text. Please try again.'));
				})
			);
	}

	/**
	 * Translate multiple texts using the undocumented Google Translate API
	 * @param texts Array of texts to translate
	 * @param targetLang The target language code
	 * @param sourceLang The source language code (default: 'auto' for auto-detection)
	 * @returns Observable of translated texts array
	 */
	translateMultiple(texts: string[], targetLang: string, sourceLang: string = 'auto'): Observable<string[]> {
		if (!texts || texts.length === 0) {
			return of([]);
		}

		// Update character count in local storage
		const charCount = this.calculateCharacterCount(texts);
		this.updateUsageInLocalStorage(charCount);

		// For Google Translate, we need to make separate requests for each text
		// We'll use forkJoin to combine all the observables
		const translationObservables = texts.map(text =>
			this.translate(text, targetLang, sourceLang)
		);

		return forkJoin(translationObservables);
	}

	/**
	 * Calculate the total character count for an array of texts
	 * @param texts Array of texts to count characters for
	 * @returns Total character count
	 */
	calculateCharacterCount(texts: string[]): number {
		return texts.reduce((total, text) => total + text.length, 0);
	}


	/**
	 * Check if adding new characters will exceed any API limits
	 * @param currentCount Current character count (not used, kept for backward compatibility)
	 * @param additionalCount Additional character count to add
	 * @param characterLimit The character limit (defaults to Google Translate limit)
	 * @returns Object with willExceedLimit and willExceedFileLimit flags
	 */
	checkWillExceedLimits(
		currentCount: number,
		additionalCount: number,
		characterLimit: number = this.GOOGLE_TRANSLATE_CHAR_LIMIT
	): { willExceedLimit: boolean, willExceedFileLimit: boolean } {
		// Get current usage from local storage
		const usage = this.getUsageFromLocalStorage() || {
			character_count: 0,
			character_limit: characterLimit,
			weekly_limit: this.GOOGLE_TRANSLATE_WEEKLY_LIMIT,
			daily_limit: this.GOOGLE_TRANSLATE_DAILY_LIMIT,
			file_char_limit: this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT,
			translation_batches: []
		};

		// Calculate current counts based on time windows
		const now = Date.now();
		const oneDayMs = 24 * 60 * 60 * 1000;
		const oneWeekMs = 7 * oneDayMs;

		let monthlyCount = 0;
		let weeklyCount = 0;
		let dailyCount = 0;

		if (usage.translation_batches) {
			for (const batch of usage.translation_batches) {
				const age = now - batch.timestamp;

				// Add to monthly count if less than a month old
				monthlyCount += batch.character_count;

				// Add to weekly count if less than a week old
				if (age < oneWeekMs) {
					weeklyCount += batch.character_count;

					// Add to daily count if less than a day old
					if (age < oneDayMs) {
						dailyCount += batch.character_count;
					}
				}
			}
		}

		// Check if adding the new character count would exceed any limit

		// Check monthly limit
		const projectedMonthlyCount = monthlyCount + additionalCount;
		const exceedsMonthly = projectedMonthlyCount > characterLimit;

		// Check weekly limit
		const weeklyLimit = usage.weekly_limit ?? this.GOOGLE_TRANSLATE_WEEKLY_LIMIT;
		const projectedWeeklyCount = weeklyCount + additionalCount;
		const exceedsWeekly = projectedWeeklyCount > weeklyLimit;

		// Check daily limit
		const dailyLimit = usage.daily_limit ?? this.GOOGLE_TRANSLATE_DAILY_LIMIT;
		const projectedDailyCount = dailyCount + additionalCount;
		const exceedsDaily = projectedDailyCount > dailyLimit;

		// Check file character limit
		const fileCharLimit = usage.file_char_limit ?? this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT;
		const exceedsFileLimit = additionalCount > fileCharLimit;

		return {
			willExceedLimit: exceedsMonthly || exceedsWeekly || exceedsDaily,
			willExceedFileLimit: exceedsFileLimit
		};
	}


	/**
	 * Calculate current usage based on translation batches
	 * @param usage The current usage data
	 * @returns Updated usage data with adjusted counts based on time windows
	 */
	private calculateCurrentUsage(usage: GoogleTranslateUsage): GoogleTranslateUsage {
		const now = Date.now();

		// Initialize translation_batches if it doesn't exist
		if (!usage.translation_batches) {
			usage.translation_batches = [];
		}

		// Define time windows
		const oneDayMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
		const oneWeekMs = 7 * oneDayMs; // 7 days in milliseconds
		const oneMonthMs = 30 * oneDayMs; // 30 days in milliseconds

		// Filter batches to keep only those within the time windows
		const validBatches = usage.translation_batches.filter(batch => {
			return now - batch.timestamp < oneMonthMs;
		});

		// If any batches were removed, update the array
		if (validBatches.length !== usage.translation_batches.length) {
			usage.translation_batches = validBatches;
		}

		// Calculate counts for different time windows
		let monthlyCount = 0;
		let weeklyCount = 0;
		let dailyCount = 0;

		for (const batch of validBatches) {
			const age = now - batch.timestamp;

			// Add to monthly count (all valid batches)
			monthlyCount += batch.character_count;

			// Add to weekly count if less than a week old
			if (age < oneWeekMs) {
				weeklyCount += batch.character_count;
			}

			// Add to daily count if less than a day old
			if (age < oneDayMs) {
				dailyCount += batch.character_count;
			}
		}

		// Update the usage object
		usage.character_count = monthlyCount;

		return usage;
	}

	/**
	 * Get usage information from local storage
	 * @returns GoogleTranslateUsage object or null if not found
	 */
	getUsageFromLocalStorage(): GoogleTranslateUsage | null {
		const usageData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
		if (!usageData) {
			return null;
		}

		const usage = JSON.parse(usageData) as GoogleTranslateUsage;
		return this.calculateCurrentUsage(usage);
	}

	/**
	 * Save usage information to local storage
	 * @param usage GoogleTranslateUsage object
	 */
	saveUsageToLocalStorage(usage: GoogleTranslateUsage): void {
		localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(usage));
	}

	/**
	 * Update usage information in local storage by adding a new translation batch
	 * @param additionalCharCount Additional character count to add
	 */
	updateUsageInLocalStorage(additionalCharCount: number): void {
		const currentUsage = this.getUsageFromLocalStorage();
		if (currentUsage) {
			// Initialize translation_batches if it doesn't exist
			if (!currentUsage.translation_batches) {
				currentUsage.translation_batches = [];
			}

			// Add a new batch with the current timestamp
			currentUsage.translation_batches.push({
				timestamp: Date.now(),
				character_count: additionalCharCount
			});

			// Recalculate the total character count
			currentUsage.character_count += additionalCharCount;

			// Save the updated usage
			this.saveUsageToLocalStorage(currentUsage);
		}
	}

	/**
	 * Get current usage information
	 * @returns Observable of GoogleTranslateUsage with monthly, weekly, and daily limits
	 */
	getUsage(): Observable<GoogleTranslateUsage> {
		const usage = this.getUsageFromLocalStorage();
		if (usage) {
			// Ensure all limits are set
			usage.weekly_limit ??= this.GOOGLE_TRANSLATE_WEEKLY_LIMIT;
			usage.daily_limit ??= this.GOOGLE_TRANSLATE_DAILY_LIMIT;
			usage.file_char_limit ??= this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT;

			// Calculate daily and weekly counts
			const now = Date.now();
			const oneDayMs = 24 * 60 * 60 * 1000;
			const oneWeekMs = 7 * oneDayMs;

			let dailyCount = 0;
			let weeklyCount = 0;

			if (usage.translation_batches) {
				for (const batch of usage.translation_batches) {
					const age = now - batch.timestamp;

					// Add to weekly count if less than a week old
					if (age < oneWeekMs) {
						weeklyCount += batch.character_count;

						// Add to daily count if less than a day old
						if (age < oneDayMs) {
							dailyCount += batch.character_count;
						}
					}
				}
			}

			// Add calculated counts to the usage object for the UI
			const result = { ...usage, daily_count: dailyCount, weekly_count: weeklyCount };
			return of(result);
		} else {
			return of({
				character_count: 0,
				character_limit: this.GOOGLE_TRANSLATE_CHAR_LIMIT,
				weekly_limit: this.GOOGLE_TRANSLATE_WEEKLY_LIMIT,
				daily_limit: this.GOOGLE_TRANSLATE_DAILY_LIMIT,
				file_char_limit: this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT,
				translation_batches: []
			});
		}
	}

	/**
	 * Fetch API usage with enhanced functionality
	 * @returns Observable of GoogleTranslateUsageResult with all limits
	 */
	fetchApiUsageWithEnhancedInfo(): Observable<GoogleTranslateUsageResult> {
		return this.getUsage().pipe(
			map(usage => {
				// The getUsage method already calculates daily_count and weekly_count
				const result: GoogleTranslateUsageResult = {
					character_count: usage.character_count,
					character_limit: usage.character_limit,
					weekly_limit: usage.weekly_limit,
					daily_limit: usage.daily_limit,
					file_char_limit: usage.file_char_limit,
					daily_count: usage.daily_count,
					weekly_count: usage.weekly_count,
					monthly_count: usage.character_count, // Monthly count is the same as character_count
					translation_batches: usage.translation_batches
				};
				return result;
			}),
			catchError(error => {
				console.error('Error fetching Google Translate usage:', error);
				return of({
					character_count: 0,
					character_limit: this.GOOGLE_TRANSLATE_CHAR_LIMIT,
					weekly_limit: this.GOOGLE_TRANSLATE_WEEKLY_LIMIT,
					daily_limit: this.GOOGLE_TRANSLATE_DAILY_LIMIT,
					file_char_limit: this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT,
					daily_count: 0,
					weekly_count: 0,
					monthly_count: 0,
					translation_batches: [],
					error: 'Error fetching usage information'
				});
			})
		);
	}

	/**
	 * Fetch all supported languages from the Google Translate API
	 * @returns Observable of GoogleLanguage objects
	 */
	fetchSupportedLanguages(): Observable<SupportedLanguage[]> {
		// Build the query parameters
		const params = new HttpParams().set('client', 'gtx');

		// Make the request to the API
		return this.httpClient.get<any>(`${this.LANGUAGES_URL}?${params.toString()}`)
			.pipe(
				map(response => {
					// The response contains 'sl' (source languages) and 'tl' (target languages)
					// We'll use the target languages ('tl') as they're the ones we can translate to
					if (response?.tl) {
						const languages: SupportedLanguage[] = [];

						// Convert the object to an array of GoogleLanguage objects
						for (const [code, name] of Object.entries(response.tl)) {
							languages.push({
								code: code,
								name: name as string
							});
						}

						console.log('Supported languages from Google Translate API:', languages);
						return languages;
					}
					throw new Error('Unexpected response format from Google Translate API');
				}),
				catchError(error => {
					console.error('Error fetching languages from Google Translate:', error);
					return throwError(() => new Error('Failed to fetch supported languages. Please try again.'));
				})
			);
	}
}
