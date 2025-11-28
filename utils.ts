import { Editor, FileManager } from 'obsidian';

export function imageSeparator(afterImageSetting: number): string {
    if (afterImageSetting === 0) {
        return '\n';
    } else if (afterImageSetting === 1) {
        return '\n\n';
    } else if (afterImageSetting === 2) {
        return '\n***\n';
    } else if (afterImageSetting === 3) {
        return '\n\n***\n';
    } else {
        return '\n';
    }
}

/**
 * Inserts the image link at the cursor position.
 * Note: The cursor position here is based on the editor's state at the time of insertion, 
 * and do not reflect the real-time cursor position if the user continues typing.
 */
export function insertImageLink(editor: Editor, imageLink: string, afterImageSetting: number) {
    const cursor = editor.getCursor(); // Get the current cursor position
    let totalInsertedText = imageLink;
    
    // Build the complete text to insert based on settings
    totalInsertedText += imageSeparator(afterImageSetting);
    
    // Insert the complete text at once
    editor.replaceRange(totalInsertedText, cursor);
    
    // Set cursor position to the end of the inserted text
    editor.setCursor(editor.offsetToPos(editor.posToOffset(cursor) + totalInsertedText.length));
}

/**
 * Get the folder path where the attachments will be saved
 * Note: If the folder path is not set, use the current note's folder
 */
export async function getAttachmentFolderPath(fileManager: FileManager): Promise<string> {
    const basePath = fileManager.getAvailablePathForAttachment('');
    return basePath;
}

// Check and update header to avoid duplicates
function checkAndUpdateHeader(header: string, removeHeaderDuplicatesSetting: boolean, lastExtractedHeader: string | null): { header: string, newLastExtractedHeader: string | null } {
    if (removeHeaderDuplicatesSetting) {
        if (header === lastExtractedHeader) {
            return { header: '', newLastExtractedHeader: lastExtractedHeader };
        }
        return { header: header, newLastExtractedHeader: header };
    }
    return { header: header, newLastExtractedHeader: lastExtractedHeader };
}

export async function extractHeader(page: any, removeHeaderDuplicatesSetting: boolean, headerExtractionSensitiveSetting: number, lastExtractedHeader: string | null): Promise<{ header: string, newLastExtractedHeader: string | null }> {
    const textContent = await page.getTextContent();
    const lines = textContent.items.map((item: any) => ({
        text: 'str' in item ? item.str : '',
        fontSize: item.transform[0] // Assuming the font size is in the first element of the transform array
    }));

    // Sort lines by font size in descending order
    lines.sort((a: { fontSize: number; }, b: { fontSize: number; }) => b.fontSize - a.fontSize);

    // Collect lines with the largest font size
    const largestFontSize = lines[0]?.fontSize || 0;
    const headerLines = lines.filter((line: { fontSize: any; text: { trim: () => { (): any; new(): any; length: number; }; }; }) => line.fontSize === largestFontSize && line.text.trim().length > 0);

    // Join the header lines to form the complete header
    const header = headerLines.map((line: { text: any; }) => line.text).join(' ').trim();

    // If no header is found, return an empty string
    if (!header) {
        return { header: '', newLastExtractedHeader: '' };
    }

    // Check if the header is significantly larger than the average font size of the page
    const averageFontSize = lines.reduce((sum: number, line: { fontSize: number; }) => sum + line.fontSize, 0) / lines.length;

    // Handle pages that contain only the header (e.g. a title page).
    // In such case: headerLines.length === lines.length and the average equals the largest font size,
    // which would cause the sensitivity check to reject the header when sensitivity > 1 (common default 1.2).
    // To support title-only pages, it should accept the header immediately.

    // If there is at least one line and all lines are header lines
    const nonEmptyLines = lines.filter((line: { text: { trim: () => { (): any; new(): any; length: number; }; }; }) => line.text.trim().length > 0);
    if (nonEmptyLines.length > 0 && headerLines.length === nonEmptyLines.length) {

        // Remove duplicate headers if the setting is enabled
        return checkAndUpdateHeader(header, removeHeaderDuplicatesSetting, lastExtractedHeader);
    }

    if (largestFontSize < averageFontSize * headerExtractionSensitiveSetting) {
        return { header: '', newLastExtractedHeader: '' };
    }

    // Remove duplicate headers if the setting is enabled
    return checkAndUpdateHeader(header, removeHeaderDuplicatesSetting, lastExtractedHeader);
}
