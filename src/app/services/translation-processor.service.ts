import {Injectable} from '@angular/core';

@Injectable({
	providedIn: 'root'
})
export class TranslationProcessorService {

	/**
	 * Create filled lines with translations
	 * @param linesToFill Array of lines to fill
	 * @param translatedLines Array of translated lines
	 * @returns Array of filled lines
	 */
	createFilledLines(linesToFill: string[], translatedLines: string[]): string[] {
		const filledLines: string[] = [];

		// Check if the arrays have different lengths
		if (linesToFill.length !== translatedLines.length) {
			console.warn(`Warning: Number of lines to fill (${linesToFill.length}) different from number of translated lines (${translatedLines.length})`);
		}

		// Make sure we have the same number of elements in both arrays
		const minLength = Math.min(linesToFill.length, translatedLines.length);

		for (let i = 0; i < minLength; i++) {
			const lineToFill = linesToFill[i];
			const translatedText = translatedLines[i];

			// Extract the command from the line to fill
			const commandMatch = /^([^"]+)/.exec(lineToFill);
			const command = commandMatch ? commandMatch[1].trim() : '';

			// Create the new line with the translation
			// Works for both Type A (Dialogue block) and Type B (Strings block)
			const filledLine = `${command} "${translatedText}"`;
			filledLines.push(filledLine);
		}

		return filledLines;
	}

	/**
	 * Find the index of a filled line with a specific command
	 * @param filledLines Array of filled lines
	 * @param command Command to search for
	 * @param startIndex Index to start searching from
	 * @returns Index of the filled line or -1 if not found
	 */
	findFilledLineIndex(filledLines: (string | null)[], command: string, startIndex: number = 0): number {
		for (let i = startIndex; i < filledLines.length; i++) {
			// Ignore lines already used (marked as null)
			if (filledLines[i] === null) {
				continue;
			}

			// We know filledLines[i] is not null at this point
			const filledLine = filledLines[i]!;
			const filledLineCommand = filledLine.split('"')[0].trim();
			if (filledLineCommand === command) {
				return i;
			}
		}

		// If we didn't find a line with the exact command, look for a line with "new" for Type B cases
		if (command === "new") {
			return -1; // Already looked for "new", not found
		}

		// If we didn't find a line with the exact command, take the first available line
		for (let i = 0; i < filledLines.length; i++) {
			if (filledLines[i] !== null) {
				return i;
			}
		}

		return -1; // Not found
	}

	/**
	 * Replace empty lines in the file content with translated lines
	 * @param fileContent The content of the file
	 * @param filledLines Array of strings with translations to fill in the file
	 * @param extractCommand Function to extract command from a line
	 * @returns The new file content with translations
	 */
	replaceLines(
		fileContent: string,
		filledLines: string[],
		extractCommand: (line: string) => string
	): string {
		if (!fileContent) {
			return '';
		}

		const lines = fileContent.split('\n');
		const outputLines: string[] = [];
		let i = 0;

		// Create a copy of the filled lines to mark them as used
		const availableFilledLines: (string | null)[] = [...filledLines];

		while (i < lines.length) {
			const line = lines[i].trim();

			// === TYPE A : Dialogue block ===
			if (line.startsWith('# game/') && lines[i + 1]?.trim().startsWith('translate french')) {
				i = this.processDialogueBlockForReplace(lines, i, outputLines, availableFilledLines, extractCommand);
				continue;
			}

			// === TYPE B : Strings block ===
			else if (line.startsWith('translate french strings:')) {
				i = this.processStringsBlockForReplace(lines, i, outputLines, availableFilledLines);
				continue;
			}

			// Other lines - copy them as they are
			outputLines.push(lines[i]);
			i++;
		}

		return outputLines.join('\n');
	}

	/**
	 * Generate a translation file from content
	 * @param content The content of the file
	 * @returns A Blob object with the file content
	 */
	generateTranslationFile(content: string): Blob {
		return new Blob([content], {type: 'text/plain'});
	}

	/**
	 * Process a dialogue block (Type A) for replacement
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param outputLines Array to store output lines
	 * @param availableFilledLines Array of available filled lines
	 * @param extractCommand Function to extract command from a line
	 * @returns New line index after processing the block
	 */
	private processDialogueBlockForReplace(
		lines: string[],
		i: number,
		outputLines: string[],
		availableFilledLines: (string | null)[],
		extractCommand: (line: string) => string
	): number {
		// Add the header lines of the block
		outputLines.push(
			lines[i],        // # game/...
			lines[i + 1],    // translate french...
			lines[i + 2] || '' // empty line
		);


		const comment1 = lines[i + 3]?.trim();
		const comment2 = lines[i + 4]?.trim();

		// Special case: two commented lines (with # and nvl clear or other command)
		if (comment1?.startsWith('#') && comment2?.startsWith('#')) {
			return this.processTwoCommentedLinesForReplace(lines, i, outputLines, availableFilledLines, extractCommand);
		}

		// Classic case: a single commented line
		else if (comment1?.startsWith('#')) {
			return this.processSingleCommentedLineForReplace(lines, i, outputLines, availableFilledLines, extractCommand);
		}

		// Unrecognized format: copy the lines as they are
		if (lines[i + 3]) outputLines.push(lines[i + 3]);
		if (lines[i + 4]) outputLines.push(lines[i + 4]);
		return i + 5;  // Move to the next block
	}

	/**
	 * Process a special case with two commented lines in a dialogue block for replacement
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param outputLines Array to store output lines
	 * @param availableFilledLines Array of available filled lines
	 * @param extractCommand Function to extract command from a line
	 * @returns New line index after processing the block
	 */
	private processTwoCommentedLinesForReplace(
		lines: string[],
		i: number,
		outputLines: string[],
		availableFilledLines: (string | null)[],
		extractCommand: (line: string) => string
	): number {
		// Add the commented lines as they are
		outputLines.push(
			lines[i + 3], // First commented line
			lines[i + 4]  // Second commented line (contains the text to translate)
		);

		// Check if there's a line to fill after the comments
		if (i + 5 < lines.length) {
			// Check if the first line after the comments is a command without quotes (like "nvl clear")
			const firstLineAfterComments = lines[i + 5].trim();

			// If the first line after the comments doesn't contain quotes, it's a command like "nvl clear"
			if (firstLineAfterComments.includes('"')) {
				return this.handleStandardCaseForReplace(lines, i, outputLines, availableFilledLines, firstLineAfterComments, i + 5, extractCommand);
			} else {
				return this.handleCommandWithoutQuotesForReplace(lines, i, outputLines, availableFilledLines, extractCommand);
			}
		} else {
			// If no line to fill, add an empty line
			outputLines.push('');
			return i + 6; // Move beyond the block
		}
	}

	/**
	 * Handle the case when the first line after comments doesn't contain quotes (like "nvl clear") for replacement
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param outputLines Array to store output lines
	 * @param availableFilledLines Array of available filled lines
	 * @param extractCommand Function to extract command from a line
	 * @returns New line index after processing the block
	 */
	private handleCommandWithoutQuotesForReplace(
		lines: string[],
		i: number,
		outputLines: string[],
		availableFilledLines: (string | null)[],
		extractCommand: (line: string) => string
	): number {
		// Add the first line as is (command without quotes)
		outputLines.push(lines[i + 5]);

		// Check if there's a second line to fill
		if (i + 6 < lines.length) {
			const secondLineAfterComments = lines[i + 6].trim();
			// Check if the second line contains empty quotes (to fill)
			if (secondLineAfterComments.includes('""')) {
				this.fillLineWithTranslation(lines, i + 6, outputLines, availableFilledLines, extractCommand);
			} else {
				// If the line already has a translation, keep it as is
				outputLines.push(lines[i + 6]);
			}
		} else {
			// If no second line to fill, add an empty line
			outputLines.push('');
		}

		return i + 7; // Move beyond the block (2 commented lines + 2 lines to fill)
	}

	/**
	 * Handle the standard case when the line contains quotes for replacement
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param outputLines Array to store output lines
	 * @param availableFilledLines Array of available filled lines
	 * @param lineToCheck The line to check for empty quotes
	 * @param lineIndex The index of the line to check
	 * @param extractCommand Function to extract command from a line
	 * @returns New line index after processing the block
	 */
	private handleStandardCaseForReplace(
		lines: string[],
		i: number,
		outputLines: string[],
		availableFilledLines: (string | null)[],
		lineToCheck: string,
		lineIndex: number,
		extractCommand: (line: string) => string
	): number {
		// Check if the line contains empty quotes (to fill)
		if (lineToCheck.includes('""')) {
			this.fillLineWithTranslation(lines, lineIndex, outputLines, availableFilledLines, extractCommand);
		} else {
			// If the line already has a translation, keep it as is
			outputLines.push(lines[lineIndex]);
		}

		return i + 6; // Move beyond the block (2 commented lines + 1 line to fill)
	}

	/**
	 * Process a classic case with a single commented line in a dialogue block for replacement
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param outputLines Array to store output lines
	 * @param availableFilledLines Array of available filled lines
	 * @param extractCommand Function to extract command from a line
	 * @returns New line index after processing the block
	 */
	private processSingleCommentedLineForReplace(
		lines: string[],
		i: number,
		outputLines: string[],
		availableFilledLines: (string | null)[],
		extractCommand: (line: string) => string
	): number {
		// Add the commented line as is
		outputLines.push(lines[i + 3]); // commented line

		// Check if there's a line to fill after the comment
		if (i + 4 < lines.length) {
			const lineToFill = lines[i + 4].trim(); // The line to fill

			// Check if the line contains empty quotes (to fill)
			if (lineToFill.includes('""')) {
				this.fillLineWithTranslation(lines, i + 4, outputLines, availableFilledLines, extractCommand);
			} else {
				// If the line already has a translation, keep it as is
				outputLines.push(lines[i + 4]);
			}
		} else {
			// If no line to fill, add an empty line
			outputLines.push('');
		}

		return i + 5;  // Move to the next block
	}

	/**
	 * Fill a line with translation if available
	 * @param lines Array of all lines in the file
	 * @param lineIndex Index of the line to fill
	 * @param outputLines Array to store output lines
	 * @param availableFilledLines Array of available filled lines
	 * @param extractCommand Function to extract command from a line
	 */
	private fillLineWithTranslation(
		lines: string[],
		lineIndex: number,
		outputLines: string[],
		availableFilledLines: (string | null)[],
		extractCommand: (line: string) => string
	): void {
		// Extract the command from the line to fill
		const commandToFill = extractCommand(lines[lineIndex]);

		// Look for a filled line with the same command
		const matchingIndex = this.findFilledLineIndex(availableFilledLines, commandToFill, 0);

		if (matchingIndex === -1) {
			// If no corresponding filled line, keep the original line
			outputLines.push(lines[lineIndex]);
		} else {
			// Use the found filled line
			const filledLine = availableFilledLines[matchingIndex]!;
			outputLines.push(`    ${filledLine}`);

			// Mark the line as used by replacing it with null
			availableFilledLines[matchingIndex] = null;
		}
	}

	/**
	 * Process a strings block (Type B) for replacement
	 * @param lines Array of all lines in the file
	 * @param i Current line index
	 * @param outputLines Array to store output lines
	 * @param availableFilledLines Array of available filled lines
	 * @returns New line index after processing the block
	 */
	private processStringsBlockForReplace(
		lines: string[],
		i: number,
		outputLines: string[],
		availableFilledLines: (string | null)[]
	): number {
		outputLines.push(lines[i]);
		i++;

		while (i < lines.length && (lines[i].trim().startsWith('old "') || lines[i].trim() === '')) {
			outputLines.push(lines[i]); // Keep the old line as is
			i++;

			if (i < lines.length) {
				const nextLine = lines[i]?.trim();

				// Check if it's an empty "new" line
				if (nextLine && nextLine.startsWith('new "') && (nextLine === 'new ""' || nextLine.endsWith('""'))) {
					this.fillNewLineWithTranslation(lines, i, outputLines, availableFilledLines);
				} else {
					// If the line already has a translation, keep it as is
					outputLines.push(lines[i] || '');
				}
			}

			i++;
		}
		return i;
	}

	/**
	 * Fill a "new" line with translation if available
	 * @param lines Array of all lines in the file
	 * @param lineIndex Index of the line to fill
	 * @param outputLines Array to store output lines
	 * @param availableFilledLines Array of available filled lines
	 */
	private fillNewLineWithTranslation(
		lines: string[],
		lineIndex: number,
		outputLines: string[],
		availableFilledLines: (string | null)[]
	): void {
		// For "new" lines, we just extract "new" as the command
		const commandToFill = "new";

		// Look for a filled line with the same command
		const matchingIndex = this.findFilledLineIndex(availableFilledLines, commandToFill, 0);

		if (matchingIndex === -1) {
			// If no corresponding filled line, keep the original line
			outputLines.push(lines[lineIndex]);
		} else {
			// Use the found filled line
			const filledLine = availableFilledLines[matchingIndex]!;
			outputLines.push(`    ${filledLine}`);

			// Mark the line as used by replacing it with null
			availableFilledLines[matchingIndex] = null;
		}
	}
}
