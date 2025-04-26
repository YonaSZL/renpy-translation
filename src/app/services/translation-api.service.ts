import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface SupportedLanguage {
  code: string;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class TranslationApiService {
  constructor(private http: HttpClient) {}

  /**
   * Fetch supported languages from DeepL API
   * @param apiKey The DeepL API key
   * @returns Observable of supported languages
   */
  fetchDeeplSupportedLanguages(apiKey: string): Observable<SupportedLanguage[]> {
    if (!apiKey) {
      return throwError(() => new Error('API key is required'));
    }

    const headers = new HttpHeaders({
      'Authorization': `DeepL-Auth-Key ${apiKey}`
    });

    return this.http.get<any>('https://api.deepl.com/v2/languages?type=target', { headers })
      .pipe(
        map(response => {
          // DeepL API returns an array of language objects with 'language' and 'name' properties
          return response.map((lang: any) => ({
            code: lang.language.toLowerCase(),
            name: lang.name
          }));
        }),
        catchError(error => {
          console.error('Error fetching DeepL supported languages:', error);
          return throwError(() => new Error('Failed to fetch supported languages from DeepL API'));
        })
      );
  }

  /**
   * Fetch supported languages from Google Translation API
   * @param apiKey The Google Translation API key
   * @returns Observable of supported languages
   */
  fetchGoogleSupportedLanguages(apiKey: string): Observable<SupportedLanguage[]> {
    if (!apiKey) {
      return throwError(() => new Error('API key is required'));
    }

    return this.http.get<any>(`https://translation.googleapis.com/language/translate/v2/languages?key=${apiKey}`)
      .pipe(
        map(response => {
          // Google API returns { data: { languages: [{ language: 'en' }, ...] } }
          return response.data.languages.map((lang: any) => ({
            code: lang.language,
            name: this.getLanguageNameFromCode(lang.language)
          }));
        }),
        catchError(error => {
          console.error('Error fetching Google supported languages:', error);
          return throwError(() => new Error('Failed to fetch supported languages from Google Translation API'));
        })
      );
  }

  /**
   * Fetch supported languages from Azure Translator API
   * @param apiKey The Azure Translator API key
   * @returns Observable of supported languages
   */
  fetchAzureSupportedLanguages(apiKey: string): Observable<SupportedLanguage[]> {
    if (!apiKey) {
      return throwError(() => new Error('API key is required'));
    }

    const headers = new HttpHeaders({
      'Ocp-Apim-Subscription-Key': apiKey
    });

    return this.http.get<any>('https://api.cognitive.microsofttranslator.com/languages?api-version=3.0&scope=translation', { headers })
      .pipe(
        map(response => {
          // Azure API returns { translation: { en: { name: 'English' }, ... } }
          const languages = response.translation;
          return Object.keys(languages).map(code => ({
            code,
            name: languages[code].name
          }));
        }),
        catchError(error => {
          console.error('Error fetching Azure supported languages:', error);
          return throwError(() => new Error('Failed to fetch supported languages from Azure Translator API'));
        })
      );
  }

  /**
   * Helper method to get language name from code
   * This is used as a fallback when the API doesn't provide language names
   */
  private getLanguageNameFromCode(code: string): string {
    const codeToName: { [key: string]: string } = {
      'en': 'English',
      'fr': 'French',
      'es': 'Spanish',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'hi': 'Hindi',
      'pl': 'Polish',
      'nl': 'Dutch',
      'uk': 'Ukrainian',
      'sv': 'Swedish',
      'ro': 'Romanian'
    };

    return codeToName[code] || code.toUpperCase();
  }
}
