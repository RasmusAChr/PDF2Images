import { App, Modal } from 'obsidian';

export class ImageNamingModal extends Modal {
    private resolve!: (name: string) => void;
    private inputValue: string = '';

    constructor(
        app: App,
        private dataUrl: string,      // base64 preview of the page
        private pageNum: number,
        private totalPages: number,
        private defaultName: string,  // fallback name (e.g. "page_3")
    ) {
        super(app);
        // Keep clicks inside the modal from bubbling; outside/backdrop clicks may still close it.
        this.modalEl.addEventListener('click', (e) => e.stopPropagation());
    }

    /** Opens the modal and returns a Promise that resolves with the chosen name. */
    waitForInput(): Promise<string> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        const header = contentEl.createEl('h2', {
            text: `Name image - Page ${this.pageNum} of ${this.totalPages}`
        });
        header.style.textAlign = 'center';
        header.style.marginTop = '0';

        // Image preview
        const previewWrapper = contentEl.createDiv();
        previewWrapper.style.cssText = `
            text-align: center;
            margin: 12px 0;
            max-height: 300px;
            overflow: hidden;
            border-radius: 6px;
            border: 1px solid var(--background-modifier-border);
        `;
        const img = previewWrapper.createEl('img');
        img.src = this.dataUrl;
        img.style.cssText = `
            max-width: 100%;
            max-height: 280px;
            object-fit: contain;
            display: block;
            margin: 0 auto;
        `;

        // Input label
        contentEl.createEl('label', {
            text: 'File name (without extension):',
            attr: { for: 'image-name-input' }
        });

        // Text input
        const input = contentEl.createEl('input', {
            type: 'text',
            attr: { id: 'image-name-input' }
        });
        input.style.cssText = `
            display: block;
            width: 100%;
            margin-top: 6px;
            padding: 6px 8px;
            box-sizing: border-box;
        `;
        input.value = this.defaultName;
        input.select();

        // Confirm on Enter
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmBtn.click();
        });

        this.inputValue = this.defaultName;
        input.addEventListener('input', () => {
            this.inputValue = input.value.trim() || this.defaultName;
        });

        // Buttons row
        const btnRow = contentEl.createDiv();
        btnRow.style.cssText = `
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-top: 16px;
        `;

        const skipBtn = btnRow.createEl('button', { text: 'Use default name' });
        skipBtn.style.padding = '8px 16px';
        skipBtn.onclick = () => {
            this.resolve(this.defaultName);
            this.close();
        };

        const confirmBtn = btnRow.createEl('button', { text: 'Confirm' });
        confirmBtn.style.cssText = `padding: 8px 16px; font-weight: bold;`;
        confirmBtn.onclick = () => {
            const finalName = this.inputValue || this.defaultName;
            this.resolve(finalName);
            this.close();
        };

        // Focus input after render
        setTimeout(() => input.focus(), 50);
    }

    onClose() {
        // If modal is closed without resolving (e.g. ESC), fall back to default
        if (this.resolve) {
            this.resolve(this.defaultName);
        }
        this.contentEl.empty();
    }
}