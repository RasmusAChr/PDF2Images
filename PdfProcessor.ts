import { App, Editor, Notice, normalizePath, FileManager } from 'obsidian';
import { PluginSettings } from './settings';
import { extractHeader, getAttachmentFolderPath, insertImageLink, imageSeparator } from './utils';

export class PdfProcessor {
    constructor(
        private app: App,
        private pdfjsLib: any,
        private settings: PluginSettings,
        private fileManager: FileManager
    ) {}

    async process(editor: Editor, file: File) {
        let progressNotice: Notice | null = null;
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);
            const pdf = await this.pdfjsLib.getDocument({ data: typedArray }).promise;
            const totalPages = pdf.numPages;
            const initialCursor = { ...editor.getCursor() };

            progressNotice = new Notice(`Processing PDF: 0/${totalPages} pages`, 0);

            // --- 1. Setup Folder Structure ---
            const pdfName = file.name.replace('.pdf', '');
            let cleanPdfName = pdfName.replace(/#/g, '');
            let folderIndex = 0;
            let folderPath = normalizePath(`${await getAttachmentFolderPath(this.fileManager)}/${cleanPdfName}`);
            
            while (await this.app.vault.adapter.exists(folderPath)) {
                folderIndex++;
                folderPath = normalizePath(`${await getAttachmentFolderPath(this.fileManager)}/${cleanPdfName}_${folderIndex}`);
            }
            await this.app.vault.createFolder(folderPath);

            // --- 2. Processing Setup ---
            const imageLinks: string[] = []; // We keep this to track final output
            
            //const CONCURRENCY_LIMIT = 20;

            const CONCURRENCY_LIMIT = Math.min(
                totalPages,
                this.settings.maxConcurrentPages,
            );

            console.log(`Using concurrency limit: ${CONCURRENCY_LIMIT}`);
            
            let completedPages = 0;
            let lastExtractedHeader: string | null = null; 

            // --- 3. Define the heavy lifting function ---
            const processSinglePage = async (pageNum: number) => {
                const page = await pdf.getPage(pageNum);
                const qualityToUse = this.settings.imageResolution;
                const viewport = page.getViewport({ scale: qualityToUse });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) throw new Error('Failed to get canvas context');

                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport }).promise;

                const blob = await new Promise<Blob>((resolve, reject) => {
                    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image blob failed')), 'image/webp', 0.9);
                });

                // MEMORY OPTIMIZATION 1: Explicitly clean up PDF.js resources
                page.cleanup();

                // MEMORY OPTIMIZATION 2: Force browser to dump canvas bitmap
                canvas.width = 0;
                canvas.height = 0;

                const imageName = `page_${pageNum}.webp`;
                const imagePath = `${folderPath}/${imageName}`;
                const arrayBufferImg = await blob.arrayBuffer();
                
                // File I/O
                await this.app.vault.createBinary(imagePath, arrayBufferImg);

                // Header Extraction (Raw)
                let rawHeader = '';
                if (this.settings.enableHeaders) {
                    // Pass false/null for duplicates, we filter them sequentially later
                    const result = await extractHeader(page, false, this.settings.headerExtractionSensitive, null);
                    rawHeader = result.header;
                }

                completedPages++;
                if (progressNotice) {
                    progressNotice.setMessage(`Processing PDF: ${completedPages}/${totalPages} pages`);
                }

                return {
                    pageNum,
                    imagePath,
                    imageName,
                    rawHeader
                };
            };

            // --- 4. The Loop (Chunked) ---
            for (let i = 1; i <= totalPages; i += CONCURRENCY_LIMIT) {
                const chunkPromises = [];
                
                // Create a batch of promises
                for (let j = 0; j < CONCURRENCY_LIMIT && (i + j) <= totalPages; j++) {
                    chunkPromises.push(processSinglePage(i + j));
                }

                // Wait for the whole batch to finish
                const chunkResults = await Promise.all(chunkPromises);

                // --- 5. Sequential Post-Processing (Ordered) ---
                for (const result of chunkResults) {
                    let finalHeader = result.rawHeader;

                    // Apply Duplicate Logic Here (sequentially) to ensure correctness
                    if (this.settings.enableHeaders && this.settings.removeHeaderDuplicates) {
                        if (finalHeader === lastExtractedHeader) {
                            finalHeader = '';
                        } else {
                            lastExtractedHeader = finalHeader;
                        }
                    }

                    // Build the link string
                    let imageLink = `${finalHeader ? `${this.settings.headerSize} ${finalHeader}\n` : ''}![${result.imageName}](${encodeURI(result.imagePath)})`;
                    imageLinks.push(imageLink);

                    // Procedural Insert (Real-time feedback)
                    if (this.settings.insertionMethod === 'Procedural') {
                        insertImageLink(editor, imageLink, this.settings.imageSeparator);
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

            new Notice('PDF processing complete');

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