import {Injectable} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import {LANGUAGE_MAP} from '../constants/language.constants';

@Injectable({
    providedIn: 'root'
})
export class LanguageLocalizationService {

    constructor(private readonly translateService: TranslateService) {
    }

    /**
     * Get the translation key for a language code
     * @param code The language code
     * @returns The translation key for the language
     */
    getLanguageNameKey(code: string): string {
        return LANGUAGE_MAP[code.toLowerCase()] ?? code.toUpperCase();
    }

    /**
     * Get the translated name of a language
     * @param code The language code
     * @returns The translated name of the language
     */
    getLanguageName(code: string): string {
        const translationKey = this.getLanguageNameKey(code);
        const translatedName = this.translateService.instant(translationKey);
        return translatedName !== translationKey ? translatedName : code.toUpperCase();
    }

    /**
     * Get the translated name of a language from its code
     * @param code The language code
     * @param fallbackName The fallback name to use if the code is not in our mapping
     * @returns The translated name of the language
     */
    getLanguageNameFromCode(code: string, fallbackName: string): string {
        if (LANGUAGE_MAP[code.toLowerCase()]) {
            return this.getLanguageName(code);
        }
        return fallbackName;
    }
}
