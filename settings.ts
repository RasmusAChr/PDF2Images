import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';

export interface PluginSettings {
	enableHeaders: boolean;
	headerSize: string;
	headerExtractionSensitive: number;
	removeHeaderDuplicates: boolean;
	imageResolution: number;
	imageSeparator: number;
	insertionMethod: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	enableHeaders: false,
	headerSize: "#",
	headerExtractionSensitive: 1.2,
	removeHeaderDuplicates: false,
	imageResolution: 1,
	imageSeparator: 0,
	insertionMethod: 'Procedural'
}

export interface Pdf2Image extends Plugin {
    settings: PluginSettings;
    saveSettings(): Promise<void>;
}

/**
 * Represents the settings page for the plugin.
 *
 * @class PluginSettingPage
 * @extends {PluginSettingTab}
 */
export class PluginSettingPage extends PluginSettingTab {
	plugin: Pdf2Image;

	constructor(app: App, plugin: Pdf2Image) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Image Quality setting
		new Setting(containerEl)
			.setName('Image quality')
			.setDesc('The quality of the images to be generated. Lower = faster and smaller file size, higher = slower and bigger file size. The default is 1x.')
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

		// Insertion Method setting
		new Setting(containerEl)
			.setName('Image insertion method')
			.setDesc('Choose how images are inserted into the editor.')
			.addDropdown(dropdown => dropdown
				.addOption('Procedural', 'Procedural (inserts images one by one)')
				.addOption('Batch', 'Batch (inserts all images at once)')
				.setValue(this.plugin.settings.insertionMethod)
				.onChange(async (value) => {
					this.plugin.settings.insertionMethod = value;
					await this.plugin.saveSettings();
				}));

		// Empty Line setting
		new Setting(containerEl)
			.setName('Image separator')
			.setDesc('Choose what to insert after each image.')
			.addDropdown(dropdown => dropdown
				.addOption('0', 'None')
				.addOption('1', 'Empty line')
				.addOption('2', 'Separator line')
				.addOption('3', 'Empty line + separator line')
				.setValue(this.plugin.settings.imageSeparator.toString())
				.onChange(async (value) => {
					this.plugin.settings.imageSeparator = parseInt(value, 10);
					await this.plugin.saveSettings();
				}));

		// Enable Headers setting
		new Setting(containerEl)
			.setName('Insert headers')
			.setDesc('Finds headers in images and inserts them above the image.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableHeaders)
				.onChange(async (value) => {
					this.plugin.settings.enableHeaders = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh the settings page to show/hide the header size setting
				}));

		// Header advanced settings
		if (this.plugin.settings.enableHeaders) {
			// Remove Header Duplicates setting
			new Setting(containerEl)
			.setName('Remove header duplicates')
			.setDesc('Removes duplicate headers from the image. This is useful if the same header appears on multiple pages.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeHeaderDuplicates)
				.onChange(async (value) => {
					this.plugin.settings.removeHeaderDuplicates = value;
					await this.plugin.saveSettings();
					this.display();
				}));

			// Header Size setting
			new Setting(containerEl)
				.setName('Header size')
				.setDesc('The size of the header to be inserted above the image.')
				.addDropdown(dropdown => dropdown
					.addOption('#', 'h1')
					.addOption('##', 'h2')
					.addOption('###', 'h3')
					.addOption('####', 'h4')
					.addOption('#####', 'h5')
					.setValue(this.plugin.settings.headerSize)
					.onChange(async (value) => {
						this.plugin.settings.headerSize = value;
						await this.plugin.saveSettings();
					})
				);

			// Header Extraction Sensitivity setting
			new Setting(containerEl)
				.setName('Header extraction sensitivity')
				.setDesc('The sensitivity of the header extraction algorithm. Increase this value if headers are not being detected. Lower this value if non-headers are being detected as headers. The default is 1.2.')
				.addSlider(slider => {
					slider
						.setLimits(0, 2, 0.1)
						.setValue(this.plugin.settings.headerExtractionSensitive)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.headerExtractionSensitive = value;
							await this.plugin.saveSettings();
						});
				});
		}
	}
}
