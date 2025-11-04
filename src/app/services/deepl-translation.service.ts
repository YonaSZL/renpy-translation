import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable, of} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {DeepLUsageResult} from '../models/deepl-usage-result.model';
import {DeepLUsageResponse} from '../models/deepl-usage-response.model';
import {DeepLResponse} from '../models/deepl-response.model';
import {
	DEEPL_API_URL,
	DEEPL_FREE_CHAR_LIMIT,
	DEEPL_HEADER_SIZE_LIMIT,
	DEEPL_REQUEST_SIZE_LIMIT,
	DEEPL_USAGE_URL
} from '../constants/api.constants';


@Injectable({
	providedIn: 'root'
})
export class DeepLTranslationService {
	constructor(private readonly httpClient: HttpClient) {}

	/**
	 * Translate multiple texts using DeepL API
	 * Handles request size limits by splitting into multiple requests if necessary
	 * @param texts Array of texts to translate
	 * @param apiKey The DeepL API key
	 * @param targetLang The target language code
	 * @returns Observable of translated texts in the same order as input
	 */
	translateMultiple(texts: string[], apiKey: string, targetLang: string): Observable<string[]> {
		if (!texts.length) {
			return new Observable(observer => {
				observer.next([]);
				observer.complete();
			});
		}

		// Calculate base parameters size (auth_key and target_lang)
		const baseParams = new HttpParams()
			.set('auth_key', apiKey)
			.set('target_lang', targetLang);

		const baseParamsSize = baseParams.toString().length;
		const availableSize = DEEPL_REQUEST_SIZE_LIMIT - DEEPL_HEADER_SIZE_LIMIT - baseParamsSize;

		// Split texts into batches that fit within the request size limit
		const batches: string[][] = [];
		let currentBatch: string[] = [];
		let currentBatchSize = 0;

		for (const text of texts) {
			// Calculate size of this text as a parameter (text=<encoded-text>)
			const textParamSize = encodeURIComponent(`text=${text}`).length + 1; // +1 for & separator

			// If adding this text would exceed the limit, start a new batch
			if (currentBatchSize + textParamSize > availableSize && currentBatch.length > 0) {
				batches.push(currentBatch);
				currentBatch = [];
				currentBatchSize = 0;
			}

			// Add text to current batch
			currentBatch.push(text);
			currentBatchSize += textParamSize;
		}

		// Add the last batch if it's not empty
		if (currentBatch.length > 0) {
			batches.push(currentBatch);
		}

		// If only one batch, make a single request
		if (batches.length === 1) {
			return this.translateBatch(batches[0], apiKey, targetLang);
		}

		// Otherwise, make multiple requests and combine the results
		return new Observable<string[]>(observer => {
			const allTranslations: string[] = new Array(texts.length);
			let completedBatches = 0;
			let startIndex = 0;

			// Process each batch
			for (const batch of batches) {
				this.translateBatch(batch, apiKey, targetLang).subscribe({
					next: (translations) => {
						// Place translations in the correct positions in the result array
						for (let i = 0; i < translations.length; i++) {
							allTranslations[startIndex + i] = translations[i];
						}
						startIndex += batch.length;
						completedBatches++;

						// If all batches are complete, emit the result
						if (completedBatches === batches.length) {
							observer.next(allTranslations);
							observer.complete();
						}
					},
					error: (err) => {
						observer.error(err);
					}
				});
			}
		});
	}

	/**
	 * Get usage information from DeepL API
	 * @param apiKey The DeepL API key
	 * @returns Observable of usage information
	 */
	getUsage(apiKey: string): Observable<DeepLUsageResponse> {
		const headers = new HttpHeaders({
			'Authorization': `DeepL-Auth-Key ${apiKey}`
		});

		return this.httpClient.get<DeepLUsageResponse>(DEEPL_USAGE_URL, {headers});
	}

	/**
	 * Fetch API usage with retry logic
	 * @param apiKey The DeepL API key
	 * @param previousCharacterCount Previous character count for comparison
	 * @param retryCount Current retry count
	 * @param maxRetryAttempts Maximum number of retry attempts
	 * @returns Observable of usage information with retry status
	 */
	fetchApiUsageWithRetry(
		apiKey: string,
		previousCharacterCount: number = 0,
		retryCount: number = 0,
		maxRetryAttempts: number = 5
	): Observable<DeepLUsageResult> {
		if (!apiKey) {
			return of({
				character_count: 0,
				character_limit: 0,
				error: 'API key is required',
				shouldRetry: false
			});
		}

		return this.getUsage(apiKey).pipe(
			map(response => {
				const result: DeepLUsageResult = {
					character_count: response.character_count,
					character_limit: response.character_limit,
					previousCharacterCount: previousCharacterCount,
					retryCount: retryCount,
					shouldRetry: false
				};

				// Check if the character count has changed
				if (response.character_count === previousCharacterCount && retryCount < maxRetryAttempts) {
					// Count hasn't changed, increment retry count
					result.retryCount = retryCount + 1;
					result.shouldRetry = true;
				}

				return result;
			}),
			catchError(error => {
				console.error('Error fetching DeepL usage:', error);
				return of({
					character_count: 0,
					character_limit: 0,
					error: 'Error fetching usage information',
					shouldRetry: false
				});
			})
		);
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
	 * Check if the character count exceeds the DeepL API limit
	 * @param characterCount The character count to check
	 * @param characterLimit The character limit (defaults to DeepL Free limit)
	 * @returns True if the count exceeds the limit, false otherwise
	 */
	exceedsCharacterLimit(characterCount: number, characterLimit: number = DEEPL_FREE_CHAR_LIMIT): boolean {
		return characterCount > characterLimit;
	}

	/**
	 * Check if adding new characters will exceed the API limit
	 * @param currentCount Current character count
	 * @param additionalCount Additional character count to add
	 * @param characterLimit The character limit (defaults to DeepL Free limit)
	 * @returns Object with willExceedLimit flag
	 */
	checkWillExceedLimit(
		currentCount: number,
		additionalCount: number,
		characterLimit: number = DEEPL_FREE_CHAR_LIMIT
	): { willExceedLimit: boolean } {
		const projectedUsage = currentCount + additionalCount;
		return {
			willExceedLimit: this.exceedsCharacterLimit(projectedUsage, characterLimit)
		};
	}

	/**
	 * Translate a batch of texts using DeepL API
	 * @param batch Array of texts to translate in a single request
	 * @param apiKey The DeepL API key
	 * @param targetLang The target language code
	 * @returns Observable of translated texts
	 */
	private translateBatch(batch: string[], apiKey: string, targetLang: string): Observable<string[]> {
		// Create HttpParams for the request
		let params = new HttpParams()
			.set('auth_key', apiKey)
			.set('target_lang', targetLang);

		// Add each text as a separate 'text' parameter
		for (const text of batch) {
			params = params.append('text', text);
		}

		const headers = new HttpHeaders({
			'Content-Type': 'application/x-www-form-urlencoded'
		});

		// Make a single request with all texts in this batch
		return this.httpClient.post<DeepLResponse>(DEEPL_API_URL, params.toString(), {headers}).pipe(
			map(response => {
				if (response.translations?.length) {
					// Extract all translated texts in order
					return response.translations.map(translation => translation.text);
				}
				throw new Error('No translation received');
			})
		);
	}
}
