import { App, Editor, Notice, normalizePath, FileManager } from 'obsidian';
import { PluginSettings } from './settings';
import { extractHeader, getAttachmentFolderPath, insertImageLink, imageSeparator, sanitizeFolderName } from './utils';
import { ImageNamingModal } from './ImageNamingModal';

export class PdfProcessor {
    constructor(
        private app: App, // Obsidian App instance
        private pdfjsLib: any, // PDF.js library instance
        private settings: PluginSettings, // Plugin settings
        private fileManager: FileManager // File manager instance
    ) {}

    async process(editor: Editor, file: File, imageQuality: number, customFolderName: string) {

        // Initialize progress notice
        let progressNotice: Notice | null = null;
        
        try {
            const arrayBuffer = await file.arrayBuffer(); // Read PDF file as array buffer
            const typedArray = new Uint8Array(arrayBuffer); // Convert to typed array which is required by PDF.js
            const pdf = await this.pdfjsLib.getDocument({ data: typedArray }).promise; // Load PDF document
            const totalPages = pdf.numPages; // Get total number of pages
            const initialCursor = { ...editor.getCursor() }; // Save initial cursor position
            let insertPosition = { ...initialCursor }; // Initialize insert position for procedural insertion

            // --- 1. Setup Folder Structure ---
            const pdfName = file.name.replace('.pdf', ''); // Remove .pdf extension from file name
            
            // Clean name to avoid issues with folder names
            let cleanPdfName = this.settings.useCustomImageFolderName && customFolderName
                ? sanitizeFolderName(customFolderName)
                : sanitizeFolderName(pdfName);
            
            let folderIndex = 0; // Initial folder index for uniqueness
            let folderPath: string;
            let baseFolderPath: string;
            
            try {
                baseFolderPath = await getAttachmentFolderPath(this.fileManager, this.settings);
                folderPath = normalizePath(`${baseFolderPath}/${cleanPdfName}`);
            } catch (e) {
                new Notice('No destination folder selected');
                return; // No destination folder set
            }
            
            // If folder with same name exists, append index to make it unique
            while (await this.app.vault.adapter.exists(folderPath)) {
                folderIndex++;
                folderPath = normalizePath(`${baseFolderPath}/${cleanPdfName}_${folderIndex}`);
            }
            await this.app.vault.createFolder(folderPath); // Create the unique folder

            // --- 2. Processing Setup ---
            const imageLinks: string[] = []; // Array to hold generated image links
            
            // Determine concurrency limit based on settings and total pages
            // Concurrency limit cannot exceed total pages to avoid unnecessary overhead
            const CONCURRENCY_LIMIT = Math.min(
                totalPages,
                this.settings.maxConcurrentPages,
            );
            
            let completedPages = 0; // Counter for completed pages
            let lastExtractedHeader: string | null = null;  // For duplicate header checking

            // Track used names to avoid collisions when user enters duplicate names
            const usedNames = new Set<string>();

            progressNotice = new Notice(`Processing PDF: ${completedPages}/${totalPages} pages`, 0); // Update notice to show start of progress

            // --- 3. Define the heavy lifting function ---
            const processSinglePage = async (pageNum: number) => {
                const page = await pdf.getPage(pageNum); // Get the page to process
                const qualityToUse = imageQuality ?? this.settings.imageResolution; // Determine quality to use
                const viewport = page.getViewport({ scale: qualityToUse }); // Get viewport at desired scale
                
                // Get original dimensions to show with 100% width
                const originalViewport = page.getViewport({ scale: 1.0 });
                const displayWidth = Math.round(originalViewport.width);

                // Canvas and context to render PDF page
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) throw new Error('Failed to get canvas context');

                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport }).promise;

                // Convert canvas to Blob (image file)
                const blob = await new Promise<Blob>((resolve, reject) => {
                    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image blob failed')), `image/${this.settings.imageType}`, 0.9); // 0.9 is only for lossy formats
                });

                // Capture preview BEFORE clearing canvas
                const dataUrl = canvas.toDataURL(`image/${this.settings.imageType}`, 0.9);

                // Explicitly clean up PDF.js resources (optimization)
                page.cleanup();

                // Force browser to dump canvas bitmap (optimization)
                canvas.width = 0;
                canvas.height = 0;

                // Header Extraction
                let rawHeader = '';
                if (this.settings.enableHeaders) {
                    rawHeader = await extractHeader(page, this.settings.headerExtractionSensitive);
                }

                completedPages++; // Increment completed pages
                if (progressNotice) { // Update progress notice
                    progressNotice.setMessage(`Processing PDF: ${completedPages}/${totalPages} pages`);
                }

                return {
                    pageNum,
                    rawHeader,
                    displayWidth,
                    qualityToUse,
                    blob,
                    dataUrl,
                    folderPath
                };
            };

            // --- 4. Loop for processing pages (Chunked) ---
            for (let i = 1; i <= totalPages; i += CONCURRENCY_LIMIT) {
                const chunkPromises = [];
                
                // Create a batch of promises
                for (let j = 0; j < CONCURRENCY_LIMIT && (i + j) <= totalPages; j++) {
                    chunkPromises.push(processSinglePage(i + j)); // Process page i + j
                }

                // Wait for the whole batch to finish
                const chunkResults = await Promise.all(chunkPromises);

                // --- 5. Sequential Post-Processing (Ordered) ---
                for (const result of chunkResults) {
                    let finalHeader = result.rawHeader;

                    // Duplicate header logic (sequentially) to ensure correctness
                    // If duplicate header removal is enabled, compare with last extracted header
                    if (this.settings.enableHeaders && this.settings.removeHeaderDuplicates) {
                        if (finalHeader === lastExtractedHeader) { // Remove duplicate if same as last
                            finalHeader = '';
                        } else { // Update last extracted header to current if not duplicate
                            lastExtractedHeader = finalHeader;
                        }
                    }

                    // Naming logic
                    const defaultBaseName = `page_${result.pageNum}`;
                    let baseName = defaultBaseName;

                    if (this.settings.enableImageNaming) {
                        const modal = new ImageNamingModal(
                            this.app,
                            result.dataUrl,
                            result.pageNum,
                            totalPages,
                            defaultBaseName
                        );
                        baseName = await modal.waitForInput();
                        baseName = sanitizeFolderName(baseName) || defaultBaseName;
                    }

                    // Ensure name uniqueness
                    let uniqueBaseName = baseName;
                    let nameIndex = 1;
                    while (usedNames.has(uniqueBaseName)) {
                        uniqueBaseName = `${baseName}_${nameIndex++}`;
                    }
                    usedNames.add(uniqueBaseName);

                    const imageName = `${uniqueBaseName}.${this.settings.imageType}`;
                    const imagePath = normalizePath(`${folderPath}/${imageName}`);

                    // Save the image file
                    const arrayBufferImg = await result.blob.arrayBuffer();
                    await this.app.vault.createBinary(imagePath, arrayBufferImg);

                    // Build the link string
                    let imageLink = '';
                    // Adjust image display width based on quality settings
                    if (result.qualityToUse < 1.0) {
                        imageLink = `${finalHeader ? `${this.settings.headerSize} ${finalHeader}\n` : ''}![${imageName}|${result.displayWidth}](${encodeURI(imagePath)})`;
                    } else {
                        imageLink = `${finalHeader ? `${this.settings.headerSize} ${finalHeader}\n` : ''}![${imageName}](${encodeURI(imagePath)})`;
                    }
                    
                    // Insert or store based on insertion method
                    if (this.settings.insertionMethod === 'Procedural') {
                        insertPosition = insertImageLink(editor, insertPosition, imageLink, this.settings.imageSeparator);
                    } else {
                        imageLinks.push(imageLink); // Store the generated image link until all pages are processed
                    }
                }
            }

            // --- 6. Batch Insert ---
            if (this.settings.insertionMethod === 'Batch') {
                let separator = imageSeparator(this.settings.imageSeparator);
                const allImageLinks = imageLinks.join(separator);
                const scrollInfo = editor.getScrollInfo();
                const cursor = initialCursor;
                editor.replaceRange(allImageLinks, cursor);
                editor.scrollTo(scrollInfo.left, scrollInfo.top);
            }

            new Notice('PDF processing complete'); // Final completion notice

        } catch (error) {
            console.error(error);
            new Notice('Failed to process PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            if (progressNotice) {
                progressNotice.hide();
            }
        }
    }
}