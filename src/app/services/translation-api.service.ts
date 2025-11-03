import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {LanguageLocalizationService} from './language-localization.service';
import {GoogleTranslateService} from './google-translate.service';
import {DeepLTranslationService} from './deepl-translation.service';
import {SupportedLanguage} from '../models/supported-language.model';

export interface ApiUsageResult {
	character_count: number;
	character_limit: number;
	weekly_limit?: number;
	daily_limit?: number;
	file_char_limit?: number;
	error?: string;
	retryCount?: number;
	previousCharacterCount?: number;
	shouldRetry?: boolean;
	willExceedLimit?: boolean;
	willExceedFileLimit?: boolean;
}

export interface TranslationResult {
	translatedTexts: string[];
	error?: string;
}

@Injectable({
	providedIn: 'root'
})
export class TranslationApiService {
	constructor(
		private readonly httpClient: HttpClient,
		private readonly languageLocalizationService: LanguageLocalizationService,
		private readonly googleTranslateService: GoogleTranslateService,
		private readonly deepLTranslationService: DeepLTranslationService
	) {
	}

	/**
	 * Fetch API usage information from the selected API
	 * @param apiType The type of API to use ('deepl-free' or 'google-free')
	 * @param apiKey The API key (required for DeepL)
	 * @param previousCharacterCount Previous character count for comparison (for DeepL retry logic)
	 * @param retryCount Current retry count (for DeepL retry logic)
	 * @param maxRetryAttempts Maximum number of retry attempts (for DeepL retry logic)
	 * @returns Observable of API usage information
	 */
	fetchApiUsage(
		apiType: string,
		apiKey: string = '',
		previousCharacterCount: number = 0,
		retryCount: number = 0,
		maxRetryAttempts: number = 5
	): Observable<ApiUsageResult> {
		if (apiType === 'deepl-free') {
			if (!apiKey) {
				return of({
					character_count: 0,
					character_limit: 0,
					error: 'API key is required for DeepL',
					shouldRetry: false
				});
			}

			return this.deepLTranslationService.fetchApiUsageWithRetry(
				apiKey,
				previousCharacterCount,
				retryCount,
				maxRetryAttempts
			).pipe(
				map(result => {
					return {
						...result,
						willExceedLimit: false,
						willExceedFileLimit: false
					};
				})
			);
		} else if (apiType === 'google-free') {
			return this.googleTranslateService.fetchApiUsageWithEnhancedInfo().pipe(
				map(result => {
					return {
						...result,
						shouldRetry: false
					};
				})
			);
		} else {
			return of({
				character_count: 0,
				character_limit: 0,
				error: `Unknown API type: ${apiType}`,
				shouldRetry: false
			});
		}
	}

	/**
	 * Check if a translation will exceed the API limit
	 * @param apiType The type of API to use ('deepl-free' or 'google-free')
	 * @param currentCount Current character count
	 * @param additionalCount Additional character count to add
	 * @param characterLimit The character limit
	 * @returns Object with willExceedLimit and willExceedFileLimit flags
	 */
	checkWillExceedLimit(
		apiType: string,
		currentCount: number,
		additionalCount: number,
		characterLimit: number
	): { willExceedLimit: boolean, willExceedFileLimit: boolean } {
		if (apiType === 'deepl-free') {
			const result = this.deepLTranslationService.checkWillExceedLimit(
				currentCount,
				additionalCount,
				characterLimit
			);
			return {
				willExceedLimit: result.willExceedLimit,
				willExceedFileLimit: false // DeepL doesn't have a file character limit
			};
		} else if (apiType === 'google-free') {
			return this.googleTranslateService.checkWillExceedLimits(
				currentCount,
				additionalCount,
				characterLimit
			);
		} else {
			return {
				willExceedLimit: false,
				willExceedFileLimit: false
			};
		}
	}

	/**
	 * Calculate character count for an array of texts
	 * @param apiType The type of API to use ('deepl-free' or 'google-free')
	 * @param texts Array of texts to count characters for
	 * @returns Total character count
	 */
	calculateCharacterCount(apiType: string, texts: string[]): number {
		if (apiType === 'deepl-free') {
			return this.deepLTranslationService.calculateCharacterCount(texts);
		} else if (apiType === 'google-free') {
			return this.googleTranslateService.calculateCharacterCount(texts);
		} else {
			// Default to a simple character count
			return texts.reduce((total, text) => total + text.length, 0);
		}
	}

	/**
	 * Translate multiple texts using the selected API
	 * @param apiType The type of API to use ('deepl-free' or 'google-free')
	 * @param texts Array of texts to translate
	 * @param targetLang The target language code
	 * @param apiKey The API key (required for DeepL)
	 * @returns Observable of translated texts
	 */
	translateTexts(
		apiType: string,
		texts: string[],
		targetLang: string,
		apiKey: string = ''
	): Observable<TranslationResult> {
		if (!texts || texts.length === 0) {
			return of({translatedTexts: []});
		}

		if (apiType === 'deepl-free') {
			if (!apiKey) {
				return of({
					translatedTexts: [],
					error: 'API key is required for DeepL'
				});
			}

			return this.deepLTranslationService.translateMultiple(texts, apiKey, targetLang).pipe(
				map(translatedTexts => ({translatedTexts})),
				catchError(error => {
					console.error('DeepL translation error:', error);
					return of({
						translatedTexts: [],
						error: 'Error translating texts with DeepL'
					});
				})
			);
		} else if (apiType === 'google-free') {
			return this.googleTranslateService.translateMultiple(texts, targetLang).pipe(
				map(translatedTexts => ({translatedTexts})),
				catchError(error => {
					console.error('Google Translate error:', error);
					return of({
						translatedTexts: [],
						error: 'Error translating texts with Google Translate'
					});
				})
			);
		} else {
			return of({
				translatedTexts: [],
				error: `Unknown API type: ${apiType}`
			});
		}
	}

	/**
	 * Fetch supported languages from DeepL API
	 * @param apiKey The DeepL API key
	 * @returns Observable of supported languages
	 */
	fetchDeeplSupportedLanguages(apiKey: string): Observable<SupportedLanguage[]> {
		const apiType = 'DeepL Free API';
		return this.fetchLanguagesFromApi(apiType, apiKey, () => {
			// Use the local proxy to avoid CORS issues and to keep a single origin.
			// Match the pattern used elsewhere in the app for DeepL endpoints.
			const endpoint = `/deepl-api/v2/languages`;
			const params = { params: { auth_key: apiKey, type: 'target' } } as const;

			return this.httpClient.get<any[]>(endpoint, params)
				.pipe(
					map(response => {
						// DeepL returns an array like: [{ language: 'EN', name: 'English' }, ...]
						return response.map((lang: any) => {
							const code = (lang.language || '').toString().toLowerCase();
							const displayName = this.languageLocalizationService.getLanguageNameFromCode(code, lang.name);
							return { code, name: displayName } as SupportedLanguage;
						});
					}),
					catchError(error => {
						console.error(`Error fetching DeepL languages via proxy ${endpoint}:`, error);
						// Surface an empty list so the UI can continue to function gracefully
						return of([] as SupportedLanguage[]);
					})
				);
		});
	}

	/**
	 * Fetch supported languages from the undocumented Google Translate API
	 * This API doesn't require an API key, and now uses the actual API to fetch languages
	 * @returns Observable of supported languages
	 */
	fetchGoogleFreeLanguages(): Observable<SupportedLanguage[]> {
		// Use the GoogleTranslateService to fetch the supported languages
		return this.googleTranslateService.fetchSupportedLanguages().pipe(
			map(languages => {
				// Map the language objects to our internal format and translate them
				return languages.map(lang => ({
					code: lang.code.toLowerCase(),
					name: this.languageLocalizationService.getLanguageNameFromCode(lang.code, lang.name)
				}));
			}),
			catchError(error => {
				console.error('Error fetching languages from Google Translate API:', error);
				// If there's an error, return an empty array
				return of([]);
			})
		);
	}

	/**
	 * Update usage information after translation
	 * @param apiType The type of API to use ('deepl-free' or 'google-free')
	 * @returns Object with information about how to handle the update
	 */
	updateUsageAfterTranslation(apiType: string): {
		needsCountdown: boolean,
		message: string
	} {
		if (apiType === 'deepl-free') {
			// Expected behavior: perform a single check immediately after translation (no countdown, no retries)
			return {
				needsCountdown: false,
				message: 'USAGE_UPDATE_NOTICE'
			};
		} else if (apiType === 'google-free') {
			// Google Translate can update usage immediately
			return {
				needsCountdown: false,
				message: 'GOOGLE_USAGE_UPDATED'
			};
		} else {
			// Default behavior
			return {
				needsCountdown: false,
				message: 'TRANSLATION_COMPLETED'
			};
		}
	}

	/**
	 * Generic method to fetch languages from any API
	 * @param apiName The name of the API (for error messages)
	 * @param apiKey The API key
	 * @param fetchFn The function to fetch languages from the API
	 * @returns Observable of supported languages
	 */
	private fetchLanguagesFromApi(
		apiName: string,
		apiKey: string,
		fetchFn: () => Observable<SupportedLanguage[]>
	): Observable<SupportedLanguage[]> {
		if (!apiKey) {
			return throwError(() => new Error('API key is required'));
		}

		return fetchFn().pipe(
			catchError(error => {
				console.error(`Error fetching ${apiName} supported languages:`, error);

				// Check if the error is due to receiving HTML instead of JSON
				if (error.error instanceof SyntaxError && error.error.message.includes('Unexpected token')) {
					console.error('Received HTML instead of JSON. This might be a proxy configuration issue.');
					console.error('Response text:', error.error.text);
					return throwError(() => new Error(`Failed to fetch languages from ${apiName}. Proxy configuration issue detected.`));
				}

				return throwError(() => new Error(`Failed to fetch languages from ${apiName}`));
			})
		);
	}
}
