import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile, normalizePath, moment, PluginSettingTab, Setting, setIcon, FuzzySuggestModal, TFolder } from 'obsidian';
import * as pdfjsLib from 'pdfjs-dist';

interface PluginSettings {
	enableHeaders: boolean;
	enableRibbonIcon: boolean;
	attachmentFolderPath: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	enableHeaders: false,
	enableRibbonIcon: true,
	attachmentFolderPath: ''
}

export default class Pdf2Image extends Plugin {
	settings: PluginSettings;
	private ribbonIconEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		// Adds settings tab for user to configure plugin settings
		this.addSettingTab(new PluginSettingPage(this.app, this));

		// Load the PDF.js worker
		pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.9.359/pdf.worker.min.js';

		// Update the ribbon icon based on the setting
		this.updateRibbonIcon();

		// Command to open the modal
		this.addCommand({
			id: 'open-pdf-to-image-modal',
			name: 'Convert PDF to Images',
			callback: () => {
				const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeLeaf) {
					new PdfToImageModal(this.app, this.handlePdf.bind(this, activeLeaf.editor)).open();
				} else {
					new Notice('Please open a note to insert images');
				}
			}
		});
	}
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	async saveSettings() {
		await this.saveData(this.settings);
		this.updateRibbonIcon(); // Update the ribbon icon when settings are saved
	}

	private updateRibbonIcon() {
		if (this.settings.enableRibbonIcon) {
			if (!this.ribbonIconEl) {
				this.ribbonIconEl = this.addRibbonIcon('image-plus', 'Convert PDF to Images', () => {
					const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (activeLeaf) {
						new PdfToImageModal(this.app, this.handlePdf.bind(this, activeLeaf.editor)).open();
					} else {
						new Notice('Please open a note to insert images');
					}
				});
			}
		} else {
			if (this.ribbonIconEl) {
				this.ribbonIconEl.remove();
				this.ribbonIconEl = null;
			}
		}
	}
	private insertImageLink(editor: Editor, imageLink: string) {
		const cursor = editor.getCursor();
		editor.replaceRange(imageLink + '\n\n', cursor); // Add an extra newline after the image link
		editor.setCursor(editor.offsetToPos(editor.posToOffset(cursor) + imageLink.length + 2)); // Adjust cursor position accordingly
	}

	private getAttachmentFolderPath(): string {
		const basePath = this.settings.attachmentFolderPath || this.app.fileManager.getNewFileParent('').path || '';
		return basePath.replace('{{date}}', moment().format('YYYY-MM-DD'));
	}

	private async handlePdf(editor: Editor, file: File) {
		let progressNotice: Notice | null = null;
		try {
			const arrayBuffer = await file.arrayBuffer();
			const typedArray = new Uint8Array(arrayBuffer);
			const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
			const totalPages = pdf.numPages;

			progressNotice = new Notice(`Processing PDF: 0/${totalPages} pages`, 0);

			const pdfName = file.name.replace('.pdf', '');
			let folderPath = normalizePath(`${this.getAttachmentFolderPath()}/${pdfName}`);

			// Check if the folder exists and create a unique folder name if it does
			let folderIndex = 0;
			while (await this.app.vault.adapter.exists(folderPath)) {
				folderIndex++;
				folderPath = normalizePath(`${this.getAttachmentFolderPath()}/${pdfName}_${folderIndex}`);
			}

			// Create the folder
			await this.app.vault.createFolder(folderPath);

			for (let i = 1; i <= totalPages; i++) {
				const page = await pdf.getPage(i);
				const viewport = page.getViewport({ scale: 1.5 });
				const canvas = document.createElement('canvas');
				const context = canvas.getContext('2d');

				if (progressNotice) {
					progressNotice.setMessage(`Processing PDF: ${i}/${totalPages} pages`);
				}

				if (!context) {
					throw new Error('Failed to get canvas context');
				}

				canvas.height = viewport.height;
				canvas.width = viewport.width;

				await page.render({ canvasContext: context, viewport: viewport }).promise;

				const imageBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

				if (!imageBlob) {
					throw new Error('Failed to create image blob');
				}

				const imageArrayBuffer = await imageBlob.arrayBuffer();

				const fileName = `${pdfName}_${i}.png`;
				const filePath = normalizePath(`${folderPath}/${fileName}`);

				await this.app.vault.createBinary(filePath, imageArrayBuffer);

				this.insertImageLink(editor, `![[${folderPath}/${fileName}]]`);
			}

			new Notice('PDF processed and images inserted successfully');
			if (progressNotice) {
				progressNotice.hide();
			}
		} catch (error) {
			console.error('Failed to process PDF', error);
			new Notice('Failed to process PDF');
		}
	}
}

class PdfToImageModal extends Modal {
	private file: File | null = null;

	constructor(app: App, private onSubmit: (file: File) => void) {
		super(app);
	}

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

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class PluginSettingPage extends PluginSettingTab {
	plugin: Pdf2Image;

	constructor(app: App, plugin: Pdf2Image) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

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

		new Setting(containerEl)
			.setName('Enable ribbon icon')
			.setDesc('Adds a ribbon icon to the toolbar to open the modal.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRibbonIcon)
				.onChange(async (value) => {
					this.plugin.settings.enableRibbonIcon = value;
					await this.plugin.saveSettings();
				}));

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

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(app: App, private onChoose: (folder: TFolder) => void) {
		super(app);
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(folder);
	}
}