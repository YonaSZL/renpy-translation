import {TranslationBatch} from './translation-batch.model';

export interface GoogleTranslateUsage {
	character_count: number;
	character_limit: number;
	weekly_limit?: number;
	daily_limit?: number;
	file_char_limit?: number;
	translation_batches?: TranslationBatch[];
	daily_count?: number;
	weekly_count?: number;
}
