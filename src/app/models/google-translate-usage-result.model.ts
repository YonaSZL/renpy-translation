import {TranslationBatch} from './translation-batch.model';

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
