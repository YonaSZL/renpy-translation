export interface DeepLUsageResult {
	character_count: number;
	character_limit: number;
	error?: string;
	retryCount?: number;
	previousCharacterCount?: number;
	shouldRetry?: boolean;
}
