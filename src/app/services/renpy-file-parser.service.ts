import {Injectable} from '@angular/core';

@Injectable({
	providedIn: 'root'
})
export class RenpyFileParserService {
	constructor() {
	}

	/**
	 * Extracts lines that need to be translated from the file content
	 * @param fileContent The content of the file
	 * @returns Array of strings to be translated
	 */
	extractLines(fileContent: string): string[] {
		if (!fileContent) {
			return [];
		}

		const lines = fileContent.split('\n');
		const linesToTranslate: string[] = [];
		let i = 0;

		while (i < lines.length) {
			const line = lines[i].trim();

			// === TYPE A : Dialogue block ===
			if (line.startsWith('# game/') && lines[i + 1]?.trim().startsWith('translate french')) {
				i = this.processDialogueBlock(lines, i, linesToTranslate);
				continue;
			}

			// === TYPE B : Strings block ===
			else if (line.startsWith('translate french strings:')) {
				i = this.processStringsBlock(lines, i, linesToTranslate);
				continue;
			}

			i++; // Move to the next line
		}

		return linesToTranslate;
	}

	/**
	 * Extract command from a line
	 * @param line Line containing command to extract
	 * @returns Extracted command
	 */
	extractCommand(line: string): string {
		// Remove spaces and comment if present at the beginning
		const cleanedLine = line.trim().replace(/^#\s*/, '');  // Remove # if present at the beginning of the line

		// Use RegExp to capture the command before the quotes
		const match = RegExp(/^([^"]+)\s*"/).exec(cleanedLine);

		if (match) {
			// match[1]: it's the command we want to extract
			return match[1].trim(); // Return only the command (e.g., "sh_i neutral")
		}

		// If the line doesn't match the expected format, try to extract a command anyway
		// This can happen with lines like "nvl clear" that don't have quotes
		const fallbackMatch = cleanedLine.split(/\s+/);
		if (fallbackMatch.length > 0) {
			return fallbackMatch[0]; // Return the first word as the command
		}

		return ''; // If no command is found, return an empty string
	}

	/**
	 * Finds lines in the file content that need to be filled with translations
	 * @param fileContent The content of the file
	 * @returns Array of strings to be filled with translations
	 */
	findLinesToFill(fileContent: string): string[] {
		if (!fileContent) {
			return [];
		}

		const lines = fileContent.split('\n');
		const linesToFill: string[] = [];
		let i = 0;

		while (i < lines.length) {
			let line = lines[i].trim();

			// === TYPE A : Dialogue block ===
			if (line.startsWith('# game/') && lines[i + 1]?.trim().startsWith('translate french')) {
				i = this.findLinesToFillInDialogueBlock(lines, i, linesToFill);
				continue;
			}

			// === TYPE B : Strings block ===
			else if (line.startsWith('translate french strings:')) {
				i = this.findLinesToFillInStringsBlock(lines, i, linesToFill);
				continue;
			}

			i++; // Move to the next line
		}

		return linesToFill;
	}

	/**
	 * Process a dialogue block (Type A) and extract text to translate
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToTranslate Array to store extracted text
	 * @returns New line index after processing the block
	 */
	private processDialogueBlock(lines: string[], i: number, linesToTranslate: string[]): number {
		const comment1 = lines[i + 3]?.trim();
		const comment2 = lines[i + 4]?.trim();

		// Special case: two commented lines (with # and nvl clear or other command)
		if (comment1?.startsWith('#') && comment2?.startsWith('#')) {
			return this.processTwoCommentedLinesCase(lines, i, linesToTranslate);
		}

		// Classic case: a single commented line
		else if (comment1?.startsWith('#')) {
			return this.processSingleCommentedLineCase(lines, i, linesToTranslate);
		}

		return i + 5;  // Move to the next block if format not recognized
	}

	/**
	 * Process a special case with two commented lines in a dialogue block
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToTranslate Array to store extracted text
	 * @returns New line index after processing the block
	 */
	private processTwoCommentedLinesCase(lines: string[], i: number, linesToTranslate: string[]): number {
		// Check if there's a line to fill after the comments
		if (i + 5 < lines.length) {
			// Check if the first line after the comments is a command without quotes (like "nvl clear")
			const firstLineAfterComments = lines[i + 5].trim();

			// If the first line after the comments doesn't contain quotes, it's a command like "nvl clear"
			if (!firstLineAfterComments.includes('"')) {
				// Check if there's a second line to fill
				if (i + 6 < lines.length) {
					const secondLineAfterComments = lines[i + 6].trim();
					// Check if the second line contains empty quotes (to fill)
					if (secondLineAfterComments.includes('""')) {
						// The second commented line contains the text to translate
						this.extractAndAddTextToTranslate(lines[i + 4], linesToTranslate);
					}
				}
				return i + 7; // Move beyond the block (2 commented lines + 2 lines to fill)
			} else {
				// Standard case: a single line to fill after the comments
				// Check if the line contains empty quotes (to fill)
				if (firstLineAfterComments.includes('""')) {
					// The second commented line contains the text to translate
					this.extractAndAddTextToTranslate(lines[i + 4], linesToTranslate);
				}
				return i + 6; // Move beyond the block (2 commented lines + 1 line to fill)
			}
		} else {
			return i + 6; // Move beyond the block if no line to fill
		}
	}

	/**
	 * Process a classic case with a single commented line in a dialogue block
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToTranslate Array to store extracted text
	 * @returns New line index after processing the block
	 */
	private processSingleCommentedLineCase(lines: string[], i: number, linesToTranslate: string[]): number {
		// Check if there's a line to fill after the comment
		if (i + 4 < lines.length) {
			const lineToFill = lines[i + 4].trim(); // The line to fill
			// Check if the line contains empty quotes (to fill)
			if (lineToFill.includes('""')) {
				this.extractAndAddTextToTranslate(lines[i + 3], linesToTranslate);
			}
		}
		return i + 5; // Move beyond the block
	}

	/**
	 * Process a strings block (Type B) and extract text to translate
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToTranslate Array to store extracted text
	 * @returns New line index after processing the block
	 */
	private processStringsBlock(lines: string[], i: number, linesToTranslate: string[]): number {
		i++; // Move to the next line

		// Look only for "old" lines followed by empty "new" lines
		while (i < lines.length) {
			const currentLine = lines[i].trim();

			// If we exit the strings block or reach another section
			if (currentLine.startsWith('translate') && !currentLine.includes('strings:')) {
				break;
			}

			// If it's an "old" line
			if (currentLine.startsWith('old "')) {
				this.processOldNewPair(lines, i, linesToTranslate);
			}

			i++; // Move to the next line
		}

		return i;
	}

	/**
	 * Process an "old"/"new" pair in a strings block
	 * @param lines Array of all lines in the file
	 * @param i Current line index (pointing to the "old" line)
	 * @param linesToTranslate Array to store extracted text
	 */
	private processOldNewPair(lines: string[], i: number, linesToTranslate: string[]): void {
		// Move to the next line which should be "new"
		const nextIndex = i + 1;
		if (nextIndex < lines.length) {
			const nextLine = lines[nextIndex].trim();
			// Check if it's an empty "new" line
			if (nextLine.startsWith('new "') && (nextLine === 'new ""' || nextLine.endsWith('""'))) {
				const oldMatch = RegExp(/old\s+"([^"]+)"/).exec(lines[i].trim());
				const textToTranslate = oldMatch?.[1] ?? '';
				if (textToTranslate) {
					linesToTranslate.push(textToTranslate);
				}
			}
		}
	}

	/**
	 * Extract text from a line and add it to the linesToTranslate array
	 * @param line Line containing text to extract
	 * @param linesToTranslate Array to store extracted text
	 */
	private extractAndAddTextToTranslate(line: string, linesToTranslate: string[]): void {
		const textToTranslate = RegExp(/"(.*)"/).exec(line)?.[1] ?? '';
		if (textToTranslate) {
			linesToTranslate.push(textToTranslate);
		}
	}

	/**
	 * Find lines to fill in a dialogue block (Type A)
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToFill Array to store lines to fill
	 * @returns New line index after processing the block
	 */
	private findLinesToFillInDialogueBlock(lines: string[], i: number, linesToFill: string[]): number {
		const comment1 = lines[i + 3]?.trim();
		const comment2 = lines[i + 4]?.trim();

		// Special case: two commented lines (with # and nvl clear or other command)
		if (comment1?.startsWith('#') && comment2?.startsWith('#')) {
			return this.findLinesToFillInTwoCommentedLinesCase(lines, i, linesToFill);
		}

		// Classic case: a single commented line
		else if (comment1?.startsWith('#')) {
			return this.findLinesToFillInSingleCommentedLineCase(lines, i, linesToFill);
		}

		return i + 5;  // Move to the next block if format not recognized
	}

	/**
	 * Find lines to fill in a special case with two commented lines in a dialogue block
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToFill Array to store lines to fill
	 * @returns New line index after processing the block
	 */
	private findLinesToFillInTwoCommentedLinesCase(lines: string[], i: number, linesToFill: string[]): number {
		// Check if there's a line to fill after the comments
		if (i + 5 < lines.length) {
			// Check if the first line after the comments is a command without quotes (like "nvl clear")
			const firstLineAfterComments = lines[i + 5].trim();

			// If the first line after the comments doesn't contain quotes, it's a command like "nvl clear"
			if (!firstLineAfterComments.includes('"')) {
				return this.handleCommandWithoutQuotes(lines, i, linesToFill);
			} else {
				return this.handleStandardCase(lines, i, linesToFill, firstLineAfterComments);
			}
		} else {
			return i + 6; // Move beyond the block if no line to fill
		}
	}

	/**
	 * Handle the case when the first line after comments doesn't contain quotes (like "nvl clear")
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToFill Array to store lines to fill
	 * @returns New line index after processing the block
	 */
	private handleCommandWithoutQuotes(lines: string[], i: number, linesToFill: string[]): number {
		// Check if there's a second line to fill
		if (i + 6 < lines.length) {
			const secondLineAfterComments = lines[i + 6].trim();
			// Check if the second line contains empty quotes (to fill)
			if (secondLineAfterComments.includes('""')) {
				this.addCommandToLinesToFill(lines[i + 4], linesToFill);
			}
		}
		return i + 7; // Move beyond the block (2 commented lines + 2 lines to fill)
	}

	/**
	 * Handle the standard case when the first line after comments contains quotes
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToFill Array to store lines to fill
	 * @param lineToCheck The line to check for empty quotes
	 * @returns New line index after processing the block
	 */
	private handleStandardCase(lines: string[], i: number, linesToFill: string[], lineToCheck: string): number {
		// Check if the line contains empty quotes (to fill)
		if (lineToCheck.includes('""')) {
			this.addCommandToLinesToFill(lines[i + 4], linesToFill);
		}
		return i + 6; // Move beyond the block (2 commented lines + 1 line to fill)
	}

	/**
	 * Extract command from a line and add it to linesToFill
	 * @param line Line to extract command from
	 * @param linesToFill Array to store lines to fill
	 */
	private addCommandToLinesToFill(line: string, linesToFill: string[]): void {
		const command = this.extractCommand(line);
		if (command) {
			linesToFill.push(`${command} ""`);
		}
	}

	/**
	 * Find lines to fill in a classic case with a single commented line in a dialogue block
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToFill Array to store lines to fill
	 * @returns New line index after processing the block
	 */
	private findLinesToFillInSingleCommentedLineCase(lines: string[], i: number, linesToFill: string[]): number {
		// Check if there's a line to fill after the comment
		if (i + 4 < lines.length) {
			const lineToFill = lines[i + 4].trim(); // The line to fill
			// Check if the line contains empty quotes (to fill)
			if (lineToFill.includes('""')) {
				// Extract the command to reuse
				const command = this.extractCommand(lines[i + 3]);
				if (command) {
					linesToFill.push(`${command} ""`);
				}
			}
		}
		return i + 5; // Move beyond the block
	}

	/**
	 * Find lines to fill in a strings block (Type B)
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param linesToFill Array to store lines to fill
	 * @returns New line index after processing the block
	 */
	private findLinesToFillInStringsBlock(lines: string[], i: number, linesToFill: string[]): number {
		i++; // Move to the next line

		while (i < lines.length) {
			const currentLine = lines[i].trim();

			// If we exit the strings block or reach another section
			if (currentLine.startsWith('translate') && !currentLine.includes('strings:')) {
				break;
			}

			// If it's an "old" line
			if (currentLine.startsWith('old "')) {
				i = this.processOldNewPairForFill(lines, i, linesToFill);
			} else {
				i++; // Move to the next line if it's not an "old" line
			}
		}

		return i;
	}

	/**
	 * Process an "old"/"new" pair in a strings block for filling
	 * @param lines Array of all lines in the file
	 * @param i Current line index (pointing to the "old" line)
	 * @param linesToFill Array to store lines to fill
	 * @returns New line index after processing the pair
	 */
	private processOldNewPairForFill(lines: string[], i: number, linesToFill: string[]): number {
		// Extract the "old" text for reference
		RegExp(/old\s+"([^"]+)"/).exec(lines[i].trim());
		// Move to the next line which should be "new"
		i++;
		if (i < lines.length) {
			const nextLine = lines[i].trim();
			// Check if it's an empty "new" line
			if (nextLine.startsWith('new "') && (nextLine === 'new ""' || nextLine.endsWith('""'))) {
				linesToFill.push(`new ""`);
			}
		}
		return i;
	}
}
