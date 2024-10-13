import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile, normalizePath, moment, PluginSettingTab, Setting, setIcon, FuzzySuggestModal, TFolder } from 'obsidian';
import * as pdfjsLib from 'pdfjs-dist';

interface PluginSettings {
	enableHeaders: boolean;
	enableRibbonIcon: boolean;
	attachmentFolderPath: string;
	imageResolution: number;
	emptyLine: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
	enableHeaders: false,
	enableRibbonIcon: true,
	attachmentFolderPath: '',
	imageResolution: 1,
	emptyLine: true
}

export default class Pdf2Image extends Plugin {
	settings: PluginSettings;
	private ribbonEl: HTMLElement | null = null;
	PDFWORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.9.359/pdf.worker.min.js';

	// When plugin loads
	async onload() {
		await this.loadSettings(); // Load the settings
		this.addSettingTab(new PluginSettingPage(this.app, this)); // Add the settings tab
		this.updateRibbon(); // Update the ribbon based on the setting

		pdfjsLib.GlobalWorkerOptions.workerSrc = this.PDFWORKER; // Load the PDF.js worker

		// Command to open the modal
		this.addCommand({
			id: 'open-pdf-to-image-modal',
			name: 'Convert PDF to Images',
			callback: () => {
				this.openPDFToImageModal()
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
		this.updateRibbon();
	}

	// Open the modal to convert PDF to images
	private openPDFToImageModal() {
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeLeaf) {
			new PdfToImageModal(this.app, this.handlePdf.bind(this, activeLeaf.editor)).open();
		} else {
			new Notice('Please open a note to insert images');
		}
	}

	// Add a ribbon icon to the toolbar if the setting is enabled
	private updateRibbon() {
		if (this.settings.enableRibbonIcon) {
			if (!this.ribbonEl) {
				this.ribbonEl = this.addRibbonIcon('image-plus', 'Convert PDF to Images', () => {
					this.openPDFToImageModal()
				});
			}
		} else {
			if (this.ribbonEl) {
				this.ribbonEl.remove();
				this.ribbonEl = null;
			}
		}
	}

	// Insert the image link at the cursor position.
	// Note: The cursor position here is based on the editor's state at the time of insertion, 
	// and do not reflect the real-time cursor position if the user continues typing.
	private insertImageLink(editor: Editor, imageLink: string) {
		const cursor = editor.getCursor(); // Get the current cursor position
		editor.replaceRange(imageLink, cursor); // Insert the image link at the cursor position
		if (this.settings.emptyLine) {
			editor.replaceRange('\n\n', editor.getCursor()); // Add an extra newline after the image link
		}
		editor.setCursor(editor.offsetToPos(editor.posToOffset(cursor) + imageLink.length)); // Adjust cursor position accordingly
	}

	// Get the folder path where the attachments will be saved
	// Note: If the folder path is not set, use the current note's folder
	private getAttachmentFolderPath(): string {
		const basePath = this.settings.attachmentFolderPath || this.app.fileManager.getNewFileParent('').path || '';
		return basePath.replace('{{date}}', moment().format('YYYY-MM-DD'));
	}

	/**
	 * Handles the conversion of a PDF file to images and inserts them into the editor.
	 * 
	 * @param editor - The editor instance where the images will be inserted.
	 * @param file - The PDF file to be processed.
	 * 
	 * @remarks
 * This function performs the following steps:
 * 1. Converts the PDF file to an array buffer and then to a typed array.
 * 2. Loads the PDF document and retrieves the total number of pages.
 * 3. Creates a folder to store the images, ensuring a unique folder name if necessary.
 * 4. Iterates through each page of the PDF, rendering it to a canvas and converting the canvas to a PNG image.
 * 5. Saves each image to the created folder and inserts a link to the image in the editor.
 * 6. Displays progress notifications during the process and a final notification upon completion.
 * 
 * @throws Will throw an error if the canvas context cannot be obtained or if the image blob creation fails.
 */
	private async handlePdf(editor: Editor, file: File) {
		let progressNotice: Notice | null = null;
		try {
			const arrayBuffer = await file.arrayBuffer(); // Convert the file to an array buffer
			const typedArray = new Uint8Array(arrayBuffer); // Convert the array buffer to a typed array
			const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise; // Load the PDF
			const totalPages = pdf.numPages; // Get the total number of pages

			progressNotice = new Notice(`Processing PDF: 0/${totalPages} pages`, 0); // Show the progress notice

			const pdfName = file.name.replace('.pdf', ''); // Get the PDF name
			let folderPath = normalizePath(`${this.getAttachmentFolderPath()}/${pdfName}`); // Get the folder path for the images

			// Check if the folder exists and create a unique folder name if it does
			let folderIndex = 0;
			while (await this.app.vault.adapter.exists(folderPath)) {
				folderIndex++;
				folderPath = normalizePath(`${this.getAttachmentFolderPath()}/${pdfName}_${folderIndex}`);
			}

			await this.app.vault.createFolder(folderPath); // Create the folder

			const imageLinks: string[] = []; // Array to store image links

			for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
				const page = await pdf.getPage(pageNum); // Get the page
				const viewport = page.getViewport({ scale: this.settings.imageResolution }); // Get the viewport
				const canvas = document.createElement('canvas'); // Create a canvas
				const context = canvas.getContext('2d'); // Get the canvas context

				if (!context) {
					throw new Error('Failed to get canvas context');
				}

				canvas.height = viewport.height;
				canvas.width = viewport.width;

				const renderContext = {
					canvasContext: context,
					viewport: viewport
				};

				await page.render(renderContext).promise; // Render the page to the canvas

				const blob = await new Promise<Blob>((resolve, reject) => {
					canvas.toBlob(blob => {
						if (blob) {
							resolve(blob);
						} else {
							reject(new Error('Failed to create image blob'));
						}
					}, 'image/png');
				});

				const imageName = `page_${pageNum}.png`;
				const imagePath = `${folderPath}/${imageName}`;
				await this.app.vault.createBinary(imagePath, await blob.arrayBuffer()); // Save the image

				const imageLink = `![${imageName}](${imagePath})`;
				imageLinks.push(imageLink); // Store the image link

				progressNotice.setMessage(`Processing PDF: ${pageNum}/${totalPages} pages`); // Update the progress notice
			}

			const allImageLinks = imageLinks.join('\n'); // Create a string containing all image links

			// Save the current scroll position
			const scrollInfo = editor.getScrollInfo();

			// Get the current cursor position
			const cursor = editor.getCursor();

			// Insert all image links at once
			if (this.settings.emptyLine) {
				editor.replaceRange(allImageLinks + '\n\n', cursor); // Add an extra newline after the image links
			} else {
				editor.replaceRange(allImageLinks, cursor);
			}

			// Restore the scroll position
			editor.scrollTo(scrollInfo.left, scrollInfo.top);

			new Notice('PDF processing complete'); // Show the final notice
		} catch (error) {
			console.error(error);
			new Notice('Failed to process PDF');
		} finally {
			if (progressNotice) {
				progressNotice.hide();
			}
		}
	}
}


/**
 * A modal dialog for selecting a PDF file and converting it to images.
 * 
 * This modal allows the user to select a PDF file from their file system and submit it for conversion.
 * It provides a file input element for selecting the PDF and a button to trigger the conversion process.
 * 
 * @extends Modal
 */
class PdfToImageModal extends Modal {
	private file: File | null = null;

	constructor(app: App, private onSubmit: (file: File) => void) {
		super(app);
	}

	/**
	 * Handles the opening of the plugin interface.
	 * 
	 * This method sets up the UI elements for the user to select a PDF file and initiate the conversion process.
	 * It creates a header, a file input for PDF selection, and a submit button.
	 * 
	 * - The file input allows the user to select a PDF file.
	 * - The submit button triggers the conversion process if a file is selected, otherwise it shows a notice.
	 * 
	 * @remarks
	 * - The selected file is stored in `this.file`.
	 * - The `onSubmit` method is called with the selected file when the submit button is clicked.
	 * - If no file is selected, a notice is displayed to the user.
	 */
	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Select a PDF file to convert' });

		const fileInput = contentEl.createEl('input', { type: 'file', attr: { accept: '.pdf' } });
		fileInput.onchange = () => {
			if (fileInput.files && fileInput.files.length > 0) {
				this.file = fileInput.files[0];
			}
		};

		const submitButton = contentEl.createEl('button', { text: 'Convert' });
		submitButton.onclick = () => {
			if (this.file) {
				this.onSubmit(this.file);
				this.close();
			} else {
				new Notice('Please select a PDF file');
			}
		};
	}

	/**
	 * Handles the closing of the plugin's UI component.
	 * This method is called when the component is closed and is responsible for cleaning up the content element.
	 * It empties the content element to ensure no residual elements remain.
	 */
	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Represents the settings page for the plugin.
 *
 * @class PluginSettingPage
 * @extends {PluginSettingTab}
 */
class PluginSettingPage extends PluginSettingTab {
	plugin: Pdf2Image;

	constructor(app: App, plugin: Pdf2Image) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Enable Headers setting
		new Setting(containerEl)
			.setName('Enable headers (not implemented yet)')
			.setDesc('Finds headers in images and inserts them above the image.')
			.addToggle(toggle => toggle
				.setDisabled(true)
				.setValue(this.plugin.settings.enableHeaders)
				.onChange(async (value) => {
					this.plugin.settings.enableHeaders = value;
					await this.plugin.saveSettings();
				}));

		// Image Resolution setting
		new Setting(containerEl)
			.setName('Image Resolution')
			.setDesc('The resolution of the images to be generated. Lower = faster and smaller file size, higher = slower and bigger file size. The default is 1x.')
			.addDropdown(dropdown => dropdown
				.addOption('0.5', '0.5x')
				.addOption('0.75', '0.75x')
				.addOption('1', '1x')
				.addOption('1.5', '1.5x')
				.addOption('2', '2x')
				.setValue(this.plugin.settings.imageResolution.toString())
				.onChange(async (value) => {
					this.plugin.settings.imageResolution = parseFloat(value);
					await this.plugin.saveSettings();
				}));

		// Empty Line setting
		new Setting(containerEl)
			.setName('Empty Line after image')
			.setDesc('Adds an empty line after each image.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.emptyLine)
				.onChange(async (value) => {
					this.plugin.settings.emptyLine = value;
					await this.plugin.saveSettings();
				}));

		// Enable Ribbon Icon setting
		new Setting(containerEl)
			.setName('Enable ribbon icon')
			.setDesc('Adds a ribbon icon to the toolbar to open the modal.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRibbonIcon)
				.onChange(async (value) => {
					this.plugin.settings.enableRibbonIcon = value;
					await this.plugin.saveSettings();
				}));

		// Attachment Folder Path setting
		new Setting(containerEl)
			.setName('Attachment Folder Path')
			.setDesc('Specify the folder path where attachments will be saved.')
			.addText(text => {
				let textComponent = text
					.setPlaceholder('Enter folder path')
					.setValue(this.plugin.settings.attachmentFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.attachmentFolderPath = value;
						await this.plugin.saveSettings();
					});

				// Add a button to open the folder selection modal
				const btn = createEl("button", {
					cls: "clickable-icon",
					attr: { type: "button", "aria-label": "Select folder" }
				});
				setIcon(btn, "folder");

				// Insert the button after the input element
				textComponent.inputEl.after(btn);

				btn.addEventListener("click", (e) => {
					e.preventDefault();
					new FolderSuggestModal(this.app, (folder) => {
						textComponent.setValue(folder.path);
						this.plugin.settings.attachmentFolderPath = folder.path;
						this.plugin.saveSettings();
					}).open();
				});

				return textComponent;
			});
	}
}


/**
 * A modal that provides a fuzzy search interface for selecting folders within the vault.
 * Extends the `FuzzySuggestModal` class to offer folder suggestions.
 *
 * @template TFolder - The type representing a folder.
 */
class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	/**
	 * Creates an instance of FolderSuggestModal.
	 *
	 * @param {App} app - The application instance.
	 * @param {(folder: TFolder) => void} onChoose - A callback function to be called when a folder is chosen.
	 */
	constructor(app: App, private onChoose: (folder: TFolder) => void) {
		super(app);
	}

	/**
	 * Retrieves all folders from the vault.
	 *
	 * @returns {TFolder[]} An array of folders.
	 */
	getItems(): TFolder[] {
		return this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
	}

	/**
	 * Gets the display text for a folder.
	 *
	 * @param {TFolder} folder - The folder to get the text for.
	 * @returns {string} The path of the folder.
	 */
	getItemText(folder: TFolder): string {
		return folder.path;
	}

	/**
	 * Handles the event when a folder is chosen.
	 *
	 * @param {TFolder} folder - The chosen folder.
	 * @param {MouseEvent | KeyboardEvent} evt - The event that triggered the choice.
	 */
	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(folder);
	}
}