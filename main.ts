import { App, Editor, MarkdownView, Notice, Plugin, normalizePath, loadPdfJs, FileManager } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, PluginSettingPage } from './settings';
import { PdfToImageModal } from './modal';
import { imageSeparator, insertImageLink, getAttachmentFolderPath, extractHeader } from './utils';
import { PdfProcessor } from 'PdfProcessor';

export default class Pdf2Image extends Plugin {
	settings: PluginSettings;
	pdfjsLib: any;
	fileManager: FileManager;

	// When plugin loads
	async onload() {
		await this.loadSettings(); // Load the settings
		this.addSettingTab(new PluginSettingPage(this.app, this)); // Add the settings tab
		this.addRibbonIcon('image-plus', 'Convert PDF to images', () => {
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
	private async handlePdf(editor: Editor, file: File, imageQuality: number) {
		const processor = new PdfProcessor(this.app, this.pdfjsLib, this.settings, this.fileManager);
		
		const start = performance.now();
		await processor.process(editor, file, imageQuality);
		const end = performance.now();
		console.log(`PDF processed in ${end - start} ms`);
	}
}


