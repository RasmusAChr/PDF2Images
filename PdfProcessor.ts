import { App, Editor, Notice, normalizePath, FileManager } from 'obsidian';
import { PluginSettings } from './settings';
import { extractHeader, getAttachmentFolderPath, insertImageLink, imageSeparator } from './utils';

export class PdfProcessor {
    constructor(
        private app: App,
        private pdfjsLib: any,
        private settings: PluginSettings,
        private fileManager: FileManager
    ) {}

    async process(editor: Editor, file: File) {
        // ... Move your handlePdf logic here ...
        // ... access settings via this.settings ...
        // ... access app via this.app ...
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
			const qualityToUse = this.settings.imageResolution !== undefined ? this.settings.imageResolution : this.settings.imageResolution;

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

				// If insertion method is 'Procedural', insert the image link immediately
				if (this.settings.insertionMethod === 'Procedural') {
					insertImageLink(editor, imageLink, this.settings.imageSeparator); // Insert the image link into the editor if the method is 'Procedural'
				}
			}

			// If insertion method is 'Batch', insert all image links at once
			if (this.settings.insertionMethod === 'Batch') {
				let separator = imageSeparator(this.settings.imageSeparator);
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