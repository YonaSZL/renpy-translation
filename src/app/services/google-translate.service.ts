import {Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable, throwError, forkJoin, of} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {SupportedLanguage} from '../models/supported-language.model';

interface GoogleTranslateUsage {
	character_count: number;
	character_limit: number;
	weekly_limit?: number;
	daily_limit?: number;
	file_char_limit?: number;
}

@Injectable({
	providedIn: 'root'
})
export class GoogleTranslateService {
	// Using the undocumented Google Translate API directly
	private readonly API_URL = 'https://translate.googleapis.com/translate_a/single';
	private readonly LANGUAGES_URL = 'https://translate.googleapis.com/translate_a/l';

	// Google Translate API limits (manually set)
	readonly GOOGLE_TRANSLATE_CHAR_LIMIT = 500000; // 500,000 characters per month
	readonly GOOGLE_TRANSLATE_WEEKLY_LIMIT = Math.floor(500000 / 4.3); // Weekly limit (monthly / 4.3)
	readonly GOOGLE_TRANSLATE_DAILY_LIMIT = Math.floor((500000 / 4.3) / 7); // Daily limit (weekly / 7)
	readonly GOOGLE_TRANSLATE_FILE_CHAR_LIMIT = 5000; // 5,000 characters per file
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
		// Keep the current character count if it exists
		const currentUsage = this.getUsageFromLocalStorage();
		const characterCount = currentUsage ? currentUsage.character_count : 0;

		// Save with updated limits
		this.saveUsageToLocalStorage({
			character_count: characterCount,
			character_limit: this.GOOGLE_TRANSLATE_CHAR_LIMIT,
			weekly_limit: this.GOOGLE_TRANSLATE_WEEKLY_LIMIT,
			daily_limit: this.GOOGLE_TRANSLATE_DAILY_LIMIT,
			file_char_limit: this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT
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
	 * Check if the character count exceeds any of the Google Translate API limits
	 * @param characterCount The character count to check
	 * @param characterLimit The monthly character limit (defaults to Google Translate limit)
	 * @returns True if the count exceeds any limit (monthly, weekly, or daily), false otherwise
	 */
	exceedsCharacterLimit(characterCount: number, characterLimit: number = this.GOOGLE_TRANSLATE_CHAR_LIMIT): boolean {
		// Get current usage
		const usage = this.getUsageFromLocalStorage();
		if (!usage) {
			return characterCount > characterLimit;
		}

		// Check if adding the new character count would exceed any limit
		const projectedCount = usage.character_count + characterCount;

		// Check monthly limit
		const exceedsMonthly = projectedCount > characterLimit;

		// Check weekly limit
		const weeklyLimit = usage.weekly_limit || this.GOOGLE_TRANSLATE_WEEKLY_LIMIT;
		const exceedsWeekly = projectedCount > weeklyLimit;

		// Check daily limit
		const dailyLimit = usage.daily_limit || this.GOOGLE_TRANSLATE_DAILY_LIMIT;
		const exceedsDaily = projectedCount > dailyLimit;

		// Return true if any limit is exceeded
		return exceedsMonthly || exceedsWeekly || exceedsDaily;
	}

	/**
	 * Check if the character count exceeds the file character limit
	 * @param characterCount The character count to check
	 * @returns True if the count exceeds the file character limit, false otherwise
	 */
	exceedsFileCharacterLimit(characterCount: number): boolean {
		const usage = this.getUsageFromLocalStorage();
		const fileCharLimit = usage?.file_char_limit || this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT;
		return characterCount > fileCharLimit;
	}

	/**
	 * Get usage information from local storage
	 * @returns GoogleTranslateUsage object or null if not found
	 */
	getUsageFromLocalStorage(): GoogleTranslateUsage | null {
		const usageData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
		return usageData ? JSON.parse(usageData) : null;
	}

	/**
	 * Save usage information to local storage
	 * @param usage GoogleTranslateUsage object
	 */
	saveUsageToLocalStorage(usage: GoogleTranslateUsage): void {
		localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(usage));
	}

	/**
	 * Update usage information in local storage by adding character count
	 * @param additionalCharCount Additional character count to add
	 */
	updateUsageInLocalStorage(additionalCharCount: number): void {
		const currentUsage = this.getUsageFromLocalStorage();
		if (currentUsage) {
			currentUsage.character_count += additionalCharCount;
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
			// Ensure weekly, daily, and file character limits are set
			if (!usage.weekly_limit) {
				usage.weekly_limit = this.GOOGLE_TRANSLATE_WEEKLY_LIMIT;
			}
			if (!usage.daily_limit) {
				usage.daily_limit = this.GOOGLE_TRANSLATE_DAILY_LIMIT;
			}
			if (!usage.file_char_limit) {
				usage.file_char_limit = this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT;
			}
			return of(usage);
		} else {
			return of({
				character_count: 0,
				character_limit: this.GOOGLE_TRANSLATE_CHAR_LIMIT,
				weekly_limit: this.GOOGLE_TRANSLATE_WEEKLY_LIMIT,
				daily_limit: this.GOOGLE_TRANSLATE_DAILY_LIMIT,
				file_char_limit: this.GOOGLE_TRANSLATE_FILE_CHAR_LIMIT
			});
		}
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
