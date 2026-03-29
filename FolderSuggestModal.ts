import { App, FuzzySuggestModal, TFolder } from 'obsidian';

// Add this class before PluginSettingPage
export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	private onChoose: (folder: TFolder) => void;

	constructor(app: App, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder('Type to search folders...');
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllFolders();
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}