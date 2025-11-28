import { App, Editor, MarkdownView, Notice, Plugin, normalizePath, loadPdfJs, FileManager } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, PluginSettingPage } from './settings';
import { PdfToImageModal } from './modal';
import { imageSeparator, insertImageLink, getAttachmentFolderPath, extractHeader } from './utils';

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

			// Remove hashtag from folder name if present
			let cleanPdfName = pdfName.replace(/#/g, '');
			let folderIndex = 0; // Initialize folder index
			let folderPath = normalizePath(`${await getAttachmentFolderPath(this.fileManager)}/${cleanPdfName}`); // Use cleaned name
			while (await this.app.vault.adapter.exists(folderPath)) { // Check if the folder already exists
				folderIndex++; // Increment folder index
				folderPath = normalizePath(`${await getAttachmentFolderPath(this.fileManager)}/${cleanPdfName}_${folderIndex}`); // Update folder path with index
			}

			await this.app.vault.createFolder(folderPath); // Create the folder

			const imageLinks: string[] = []; // Initialize an array to store image links

			// Use the provided imageQuality or fall back to settings
			const qualityToUse = imageQuality !== undefined ? imageQuality : this.settings.imageResolution;

			let lastExtractedHeader: string | null = null;
			
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
					const result = await extractHeader(page, this.settings.removeHeaderDuplicates, this.settings.headerExtractionSensitive, lastExtractedHeader); // Extract the header from the page if enabled
					header = result.header;
					lastExtractedHeader = result.newLastExtractedHeader;
				}
				let imageLink = `${header ? `${this.settings.headerSize} ${header}\n` : ''}![${imageName}](${encodeURI(imagePath)})`; // Create the image link with header if available
				
				imageLinks.push(imageLink); // Add the image link to the array

				progressNotice.setMessage(`Processing PDF: ${pageNum}/${totalPages} pages`); // Update the progress notice

				// If insertion method is 'Procedual', insert the image link immediately
				if (this.settings.insertionMethod === 'Procedual') {
					insertImageLink(editor, imageLink, this.settings.afterImage); // Insert the image link into the editor if the method is 'Procedual'
				}
			}

			// If insertion method is 'Batch', insert all image links at once
			if (this.settings.insertionMethod === 'Batch') {
				let separator = imageSeparator(this.settings.afterImage);
				const allImageLinks = imageLinks.join(separator); // Join all image links into a single string
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


