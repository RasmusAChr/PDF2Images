import { Editor, MarkdownView, Notice, Plugin, loadPdfJs, FileManager } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, PluginSettingPage } from './settings';
import { PdfToImageModal } from './modal';
import { PdfProcessor } from './PdfProcessor';

export default class Pdf2Image extends Plugin {
	settings: PluginSettings;
	pdfjsLib: any;
	fileManager: FileManager;

	// When plugin loads
	async onload() {
		await this.loadSettings(); // Load the settings
		this.addSettingTab(new PluginSettingPage(this.app, this)); // Add the settings tab
		this.addRibbonIcon('image-plus', 'Convert PDF to images', () => { // Add ribbon icon to open modal
			this.openPDFToImageModal()
		});

		this.pdfjsLib = await loadPdfJs(); // Load PDF.js library
		this.fileManager = this.app.fileManager; // Initialize file manager to be used in PdfProcessor

		// Conditional command to open the modal
		// This command is only active when a note is open
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

	// Open the modal to convert PDF to images if a note is active
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
	 * @param imageQuality - The quality (scale) to render images at. This value is always provided by the modal and the default value is the plugin setting.
	 * @remarks The imageQuality parameter allows overriding the default image resolution for this operation.
	 */
	private async handlePdf(editor: Editor, file: File, imageQuality: number) {
		const processor = new PdfProcessor(this.app, this.pdfjsLib, this.settings, this.fileManager);
		await processor.process(editor, file, imageQuality);
	}
}


