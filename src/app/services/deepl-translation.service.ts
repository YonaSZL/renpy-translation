import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';

interface DeepLResponse {
    translations: {
        detected_source_language: string;
        text: string;
    }[];
}

interface DeepLUsageResponse {
    character_count: number;
    character_limit: number;
}

@Injectable({
    providedIn: 'root'
})
export class DeepLTranslationService {
    // DeepL API limits
    readonly DEEPL_FREE_CHAR_LIMIT = 500000; // 500,000 characters per month for DeepL API Free
    readonly DEEPL_REQUEST_SIZE_LIMIT = 128 * 1024; // 128 KiB (128*1024 bytes)
    readonly DEEPL_HEADER_SIZE_LIMIT = 16 * 1024; // 16 KiB (16*1024 bytes)
    private readonly API_URL = '/deepl-api/v2/translate'; // Path to the proxy
    private readonly USAGE_URL = '/deepl-api/v2/usage'; // Path to the usage endpoint

    constructor(private readonly httpClient: HttpClient) {
    }

    translateMultiple(texts: string[], apiKey: string, targetLang: string): Observable<string[]> {
        // Create HttpParams for the request
        let params = new HttpParams()
            .set('auth_key', apiKey)
            .set('target_lang', targetLang);

        // Add each text as a separate 'text' parameter
        for (const text of texts) {
            params = params.append('text', text);
        }

        const headers = new HttpHeaders({
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        // Make a single request with all texts
        return this.httpClient.post<DeepLResponse>(this.API_URL, params.toString(), {headers}).pipe(
            map(response => {
                if (response.translations?.length) {
                    // Extract all translated texts in order
                    return response.translations.map(translation => translation.text);
                }
                throw new Error('No translation received');
            })
        );
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

        return this.httpClient.get<DeepLUsageResponse>(this.USAGE_URL, {headers});
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
    exceedsCharacterLimit(characterCount: number, characterLimit: number = this.DEEPL_FREE_CHAR_LIMIT): boolean {
        return characterCount > characterLimit;
    }
}
