import { App, AbstractInputSuggest, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(query: string): TFolder[] {
        const folders = this.app.vault.getAllFolders();
        const lower = query.toLowerCase();
        return folders.filter(f => f.path.toLowerCase().includes(lower));
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path);
    }

    selectSuggestion(folder: TFolder): void {
        this.inputEl.value = folder.path;
        this.inputEl.trigger('input'); // fires onChange
        this.close();
    }
}