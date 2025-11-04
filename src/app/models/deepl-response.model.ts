export interface DeepLResponse {
	translations: {
		detected_source_language: string;
		text: string;
	}[];
}
