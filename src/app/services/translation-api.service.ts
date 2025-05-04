import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {LanguageLocalizationService} from './language-localization.service';
import {GoogleTranslateService} from './google-translate.service';
import {SupportedLanguage} from '../models/supported-language.model';

@Injectable({
	providedIn: 'root'
})
export class TranslationApiService {
	constructor(
		private readonly httpClient: HttpClient,
		private readonly languageLocalizationService: LanguageLocalizationService,
		private readonly googleTranslateService: GoogleTranslateService
	) {
	}

	/**
	 * Fetch supported languages from DeepL API
	 * @param apiKey The DeepL API key
	 * @returns Observable of supported languages
	 */
	fetchDeeplSupportedLanguages(apiKey: string): Observable<SupportedLanguage[]> {
		const apiType = 'DeepL Free API';
		return this.fetchLanguagesFromApi(apiType, apiKey, () => {

			const endpoint = `https://api-free.deepl.com/v2/languages?auth_key=${apiKey}`;
			console.log(`Using endpoint: ${endpoint} for ${apiType}`);

			// Simple GET request with minimal options
			return this.httpClient.get<any>(endpoint)
				.pipe(
					map(response => {
						console.log('DeepL API response:', response);
						return response;
					}),
					catchError(error => {
						console.error(`Error with ${endpoint}:`, error);
						throw error;
					}),
					map(response => {
						// DeepL API returns an array of language objects with 'language' and 'name' properties
						// Map the language codes to our internal codes and translate the names
						return response.map((lang: any) => {
							const code = lang.language.toLowerCase();
							// Try to get a translated name from our language service
							// If the language code is in our mapping, use the translated name
							// Otherwise, use the name from the API
							const translatedName = this.languageLocalizationService.getLanguageNameFromCode(code, lang.name);
							return {
								code: code,
								name: translatedName
							};
						});
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
