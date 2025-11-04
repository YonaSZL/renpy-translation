// DeepL API limits
export const DEEPL_FREE_CHAR_LIMIT = 500000; // 500,000 characters per month for DeepL API Free
export const DEEPL_REQUEST_SIZE_LIMIT = 128 * 1024; // 128 KiB (128*1024 bytes)
export const DEEPL_HEADER_SIZE_LIMIT = 16 * 1024; // 16 KiB (16*1024 bytes)
export const DEEPL_API_URL = '/deepl-api/v2/translate'; // Path to the proxy
export const DEEPL_USAGE_URL = '/deepl-api/v2/usage'; // Path to the usage endpoint

// Google Translate API limits (manually set)
export const GOOGLE_TRANSLATE_CHAR_LIMIT = 500000; // 500,000 characters per month
export const GOOGLE_TRANSLATE_WEEKLY_LIMIT = Math.floor(500000 / 4.3); // Weekly limit (monthly / 4.3)
export const GOOGLE_TRANSLATE_DAILY_LIMIT = Math.floor((500000 / 4.3) / 7); // Daily limit (weekly / 7)
export const GOOGLE_TRANSLATE_FILE_CHAR_LIMIT = 5000; // 5,000 characters per file
// Using the undocumented Google Translate API directly
export const GOOGLE_TRANSLATE_API_URL = 'https://translate.googleapis.com/translate_a/single';
export const GOOGLE_TRANSLATE_USAGE_URL = 'https://translate.googleapis.com/translate_a/l';
export const GOOGLE_TRANSLATE_LOCAL_STORAGE_KEY = 'google_translate_usage';
