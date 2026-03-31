import { App, Modal, Notice } from 'obsidian';
import { sanitizeFolderName } from 'utils';

/**
 * A modal dialog for selecting a PDF file and converting it to images.
 * 
 * This modal allows the user to select a PDF file from their file system and submit it for conversion.
 * It provides a file input element for selecting the PDF and a button to trigger the conversion process.
 * 
 * @extends Modal
 */
export class PdfToImageModal extends Modal {
	private file: File | null = null;
	private imageQuality: number;
	private customFolderName: string = '';

	constructor(app: App, private onSubmit: (file: File, imageQuality: number, customFolderName: string) => void, defaultImageQuality: number, private useCustomFolderName: boolean) {
		super(app);
		this.imageQuality = defaultImageQuality;

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
	 * - The `onSubmit` method is called with the selected file and image quality when the submit button is clicked.
	 * - If no file is selected, a notice is displayed to the user.
	 */
	onOpen() {
		const ILLEGAL_CHARS = /[#\/\\:*?"<>|.]/;
		const { contentEl } = this;
		const header = contentEl.createEl('h2', { text: 'Select a PDF file to convert' });
		header.style.textAlign = 'center';
		header.style.marginTop = '0px';

		// File input section
		const fileSection = contentEl.createDiv();

		const fileInputWrapper = fileSection.createDiv();
		fileInputWrapper.style.marginTop = '5px';
		fileInputWrapper.style.textAlign = 'center';

		// Hide the actual file input
		const fileInput = fileInputWrapper.createEl('input', { 
			type: 'file', 
			attr: { accept: '.pdf' } 
		});
		fileInput.style.display = 'none';

		// Create a custom button
        const customFileButton = fileInputWrapper.createEl('button', { 
            text: 'Choose PDF File',
            attr: {
                'aria-label': 'Choose PDF file to upload',
                'aria-controls': fileInput.id || 'pdf-file-input'
            }
        });
		customFileButton.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
        `;

		fileInput.id = fileInput.id || 'pdf-file-input';

		customFileButton.onclick = (e) => {
			e.preventDefault();
			fileInput.click();
		};

		// Create custom file name display
		const fileNameDisplay = fileInputWrapper.createDiv();
		fileNameDisplay.style.cssText = `
			margin-top: 8px;
			font-size: 0.9em;
			color: #666;
			font-style: italic;
		`;
		fileNameDisplay.textContent = 'No file chosen';

		fileInput.onchange = () => {
			if (fileInput.files && fileInput.files.length > 0) {
				this.file = fileInput.files[0];
				fileNameDisplay.textContent = `${fileInput.files[0].name}`;
				fileNameDisplay.style.color = '#7a7a7a';
				fileNameDisplay.style.fontStyle = 'normal';
			} else {
				fileNameDisplay.textContent = 'No file chosen';
				fileNameDisplay.style.color = '#666';
				fileNameDisplay.style.fontStyle = 'italic';
			}
		};

		// Custom folder name input (only shown if setting is enabled)
		if (this.useCustomFolderName) {
			const folderSection = contentEl.createDiv();
			folderSection.style.marginTop = '15px';
			folderSection.style.textAlign = 'center';
			folderSection.createEl('label', { text: 'Image Folder Name', attr: { for: 'image-folder-name-input' } });
			folderSection.createEl('br');

			const folderInput = folderSection.createEl('input', { type: 'text', attr: { id: 'image-folder-name-input' } });
			folderInput.style.cssText = `
				margin-top: 5px;
				padding: 5px;
				width: 80%;
			`;
			folderInput.placeholder = 'e.g. my-pdf-images';
			folderInput.oninput = () => {
				this.customFolderName = folderInput.value.trim();
			};
		}

		// Image quality dropdown section
		const qualitySection = contentEl.createDiv();
		qualitySection.style.marginTop = '15px';
		qualitySection.style.textAlign = 'center';
		qualitySection.createEl('label', { text: 'Image Quality' });
		qualitySection.createEl('br');
		const qualitySelect = qualitySection.createEl('select');
		qualitySelect.style.marginTop = '5px';
		qualitySelect.style.padding = '5px';
		qualitySelect.style.cursor = 'pointer';
		
		// Add options to the dropdown
		const qualityOptions = [
			{ value: '0.5', text: '0.5x' },
			{ value: '0.75', text: '0.75x' },
			{ value: '1', text: '1x' },
			{ value: '1.5', text: '1.5x' },
			{ value: '2', text: '2x' }
		];

		qualityOptions.forEach(option => {
			const optionEl = qualitySelect.createEl('option', { 
				value: option.value, 
				text: option.text 
			});
			optionEl.style.textAlign = 'center';
			if (parseFloat(option.value) === this.imageQuality) {
				optionEl.selected = true;
			}
		});

		qualitySelect.onchange = () => {
			this.imageQuality = parseFloat(qualitySelect.value);
		};

		// Submit button
		const buttonSection = contentEl.createDiv();
		buttonSection.style.marginTop = '20px';
		buttonSection.style.textAlign = 'center';
		const submitButton = buttonSection.createEl('button', { text: 'Convert' });
		submitButton.style.padding = '10px 20px';
		submitButton.style.cursor = 'pointer';
		submitButton.onclick = () => {
			if (this.file) {
				if (this.useCustomFolderName && !this.customFolderName) {
					new Notice('Please enter a folder name or disable the custom folder name setting');
					return;
				}
				if (ILLEGAL_CHARS.test(this.customFolderName)) {
					new Notice('Folder name contains invalid characters: # / \\ : * ? " < > | .');
					return;
				}
				this.onSubmit(this.file, this.imageQuality, this.customFolderName);
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
