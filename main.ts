import { App, Editor, MarkdownView, Notice, Plugin, normalizePath, loadPdfJs, FileManager } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, PluginSettingPage } from './settings';
import { PdfToImageModal } from './modal';

export default class Pdf2Image extends Plugin {
	settings: PluginSettings;
	ribbonEl: HTMLElement | null = null;
	pdfjsLib: any;
	fileManager: FileManager;

	// When plugin loads
	async onload() {
		await this.loadSettings(); // Load the settings
		this.addSettingTab(new PluginSettingPage(this.app, this)); // Add the settings tab
		this.ribbonEl = this.addRibbonIcon('image-plus', 'Convert PDF to images', () => {
			this.openPDFToImageModal()
		});

		this.pdfjsLib = await loadPdfJs();
		this.fileManager = this.app.fileManager;

		// Conditional command to open the modal
		this.addCommand({
			id: 'open-pdf-to-image-modal',
			name: 'Convert PDF to images',
			checkCallback: (checking: boolean) => {
				const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeLeaf) {
					if (!checking) {
						this.openPDFToImageModal();
					}
					return true;
				}
				return false;
			}
		});
	}

	// Load settings from the data file
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	// Save settings to the data file
	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Open the modal to convert PDF to images
	private openPDFToImageModal() {
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeLeaf) {
			new PdfToImageModal(
				this.app, 
				this.handlePdf.bind(this, activeLeaf.editor), 
				this.settings.imageResolution
			).open();
		} else {
			new Notice('Please open a note to insert images');
		}
	}

	// Insert the image link at the cursor position.
	// Note: The cursor position here is based on the editor's state at the time of insertion, 
	// and do not reflect the real-time cursor position if the user continues typing.
	private insertImageLink(editor: Editor, imageLink: string) {
		const cursor = editor.getCursor(); // Get the current cursor position
		let totalInsertedText = imageLink;
		
		// Build the complete text to insert based on settings
		if (this.settings.afterImage === 0) {
			totalInsertedText += '\n';
		} else if (this.settings.afterImage === 1) {
			totalInsertedText += '\n';
		} else if (this.settings.afterImage === 2) {
			totalInsertedText += '***\n';
		} else if (this.settings.afterImage === 3) {
			totalInsertedText += '\n***\n';
		}
		
		// Insert the complete text at once
		editor.replaceRange(totalInsertedText, cursor);
		
		// Set cursor position to the end of the inserted text
		editor.setCursor(editor.offsetToPos(editor.posToOffset(cursor) + totalInsertedText.length));
	}

	// Get the folder path where the attachments will be saved
	// Note: If the folder path is not set, use the current note's folder
	private async getAttachmentFolderPath(): Promise<string> {
		const basePath = this.fileManager.getAvailablePathForAttachment('');
		return basePath;
	}

	// Check and update header to avoid duplicates
	private checkAndUpdateHeader(header: string): string {
		if (this.settings.removeHeaderDuplicates) {
			if (header === this.lastExtractedHeader) {
				return '';
			}
			this.lastExtractedHeader = header;
		}
		return header;
	}

	private lastExtractedHeader: string | null = null;

	private async extractHeader(page: any): Promise<string> {
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
			this.lastExtractedHeader = '';
			return '';
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
			return this.checkAndUpdateHeader(header);
		}

		if (largestFontSize < averageFontSize * this.settings.headerExtractionSensitive) {
			this.lastExtractedHeader = '';
			return '';
		}

		// Remove duplicate headers if the setting is enabled
		return this.checkAndUpdateHeader(header);
	}

	/**
	 * Handles the conversion of a PDF file to images and inserts them into the editor.
	 * 
	 * @param editor - The editor instance where the images will be inserted.
	 * @param file - The PDF file to be processed.
	 * @param imageQuality - (Optional) The quality (scale) to render images at. If not provided, uses the plugin setting.
	 * 
	 * @remarks
	 * This function performs the following steps:
	 * 1. Converts the PDF file to an array buffer and then to a typed array.
	 * 2. Loads the PDF document and retrieves the total number of pages.
	 * 3. Creates a folder to store the images, ensuring a unique folder name if necessary.
	 * 4. Iterates through each page of the PDF, rendering it to a canvas using the specified image quality (scale), and converts the canvas to a PNG image.
	 * 5. Saves each image to the created folder and inserts a link to the image in the editor.
	 * 6. Displays progress notifications during the process and a final notification upon completion.
	 * 
	 * The imageQuality parameter allows overriding the default image resolution for this operation.
	 * 
	 * @throws Will throw an error if the canvas context cannot be obtained or if the image blob creation fails.
	 */
	private async handlePdf(editor: Editor, file: File, imageQuality?: number) {
		let progressNotice: Notice | null = null;
		try {
			const arrayBuffer = await file.arrayBuffer(); // Convert the file to an array buffer
			const typedArray = new Uint8Array(arrayBuffer); // Create a typed array from the array buffer
			const pdf = await this.pdfjsLib.getDocument({ data: typedArray }).promise; // Load the PDF document
			const totalPages = pdf.numPages; // Get the total number of pages in the PDF
			const initialCursor = { ...editor.getCursor() }; // Save a copy of the initial cursor position

			progressNotice = new Notice(`Processing PDF: 0/${totalPages} pages`, 0); // Show a progress notice

			const pdfName = file.name.replace('.pdf', ''); // Get the PDF name without the extension
			let folderPath = normalizePath(`${await this.getAttachmentFolderPath()}/${pdfName}`); // Create the folder path for images

			// Remove hashtag from folder name if present
			let cleanPdfName = pdfName.replace(/#/g, '');
			let folderIndex = 0; // Initialize folder index
			folderPath = normalizePath(`${await this.getAttachmentFolderPath()}/${cleanPdfName}`); // Use cleaned name
			while (await this.app.vault.adapter.exists(folderPath)) { // Check if the folder already exists
				folderIndex++; // Increment folder index
				folderPath = normalizePath(`${await this.getAttachmentFolderPath()}/${cleanPdfName}_${folderIndex}`); // Update folder path with index
			}

			await this.app.vault.createFolder(folderPath); // Create the folder

			const imageLinks: string[] = []; // Initialize an array to store image links

			// Use the provided imageQuality or fall back to settings
			const qualityToUse = imageQuality !== undefined ? imageQuality : this.settings.imageResolution;

			for (let pageNum = 1; pageNum <= totalPages; pageNum++) { // Loop through each page of the PDF
				const page = await pdf.getPage(pageNum); // Get the page
				const viewport = page.getViewport({ scale: qualityToUse }); // Get the viewport with the specified resolution
				const canvas = document.createElement('canvas'); // Create a canvas element
				const context = canvas.getContext('2d'); // Get the canvas context

				if (!context) { // Check if the context is null
					throw new Error('Failed to get canvas context'); // Throw an error if context is null
				}

				canvas.height = viewport.height; // Set the canvas height
				canvas.width = viewport.width; // Set the canvas width

				const renderContext = {
					canvasContext: context, // Set the canvas context
					viewport: viewport // Set the viewport
				};

				await page.render(renderContext).promise; // Render the page to the canvas

				const blob = await new Promise<Blob>((resolve, reject) => { // Create a blob from the canvas
					canvas.toBlob(blob => {
						if (blob) {
							resolve(blob); // Resolve the promise with the blob
						} else {
							reject(new Error('Failed to create image blob')); // Reject the promise if blob creation fails
						}
					}, 'image/png');
				});

				const imageName = `page_${pageNum}.png`; // Create the image name
				const imagePath = `${folderPath}/${imageName}`; // Create the image path
				await this.app.vault.createBinary(imagePath, await blob.arrayBuffer()); // Save the image to the vault

				let header = '';
				if (this.settings.enableHeaders) {
					header = await this.extractHeader(page); // Extract the header from the page if enabled
				}
				let imageLink = `${header ? `${this.settings.headerSize} ${header}\n` : ''}![${imageName}](${encodeURI(imagePath)})`; // Create the image link with header if available
				if (this.settings.afterImage) {
					imageLink += '\n'; // Add an empty line after the image link if the setting is enabled
				}
				imageLinks.push(imageLink); // Add the image link to the array

				progressNotice.setMessage(`Processing PDF: ${pageNum}/${totalPages} pages`); // Update the progress notice

				// If insertion method is 'Procedual', insert the image link immediately
				if (this.settings.insertionMethod === 'Procedual') {
					this.insertImageLink(editor, imageLink); // Insert the image link into the editor if the method is 'Procedual'
				}
			}

			// If insertion method is 'Batch', insert all image links at once
			if (this.settings.insertionMethod === 'Batch') {
				const allImageLinks = imageLinks.join('\n'); // Join all image links into a single string
				const scrollInfo = editor.getScrollInfo(); // Get the current scroll info
				const cursor = initialCursor; // Get the initial cursor position
				editor.replaceRange(allImageLinks, cursor); // Insert all image links into the editor
				editor.scrollTo(scrollInfo.left, scrollInfo.top); // Restore the scroll position
			}

			new Notice('PDF processing complete'); // Show a notice when processing is complete
		} catch (error) {
			console.error(error); // Log the error to the console
			new Notice('Failed to process PDF'); // Show a notice if processing fails
		} finally {
			if (progressNotice) {
				progressNotice.hide(); // Hide the progress notice
			}
		}
	}
}


