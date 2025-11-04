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
