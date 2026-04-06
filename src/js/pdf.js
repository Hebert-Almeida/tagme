'use strict';

// SECURITY: PDF files are processed entirely client-side.
// Pages are rendered to canvas and sent as images to the AI vision API.
// No file content is uploaded to any server by this module.

const MAX_PDF_BYTES  = 50 * 1024 * 1024; // 50 MB
const MAX_PAGES      = 4;                 // first N pages sent for vision analysis
const RENDER_SCALE   = 1.5;              // 150 % — good balance of quality vs. size
const JPEG_QUALITY   = 0.78;            // JPEG compression (0–1)

// Configure the PDF.js worker once at module load.
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

/**
 * Render the first N pages of a PDF as JPEG data URLs.
 * Returns an array of base64 data-URL strings ready for AI vision analysis.
 *
 * @param {File} file
 * @returns {Promise<string[]>}  array of data:image/jpeg;base64,... strings
 */
export async function renderPDFPages(file) {
    _validate(file);

    const arrayBuffer = await file.arrayBuffer();

    let pdf;
    try {
        pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch {
        throw new Error(
            'Não foi possível abrir o PDF. O arquivo pode estar corrompido ou protegido por senha.'
        );
    }

    const numPages = Math.min(pdf.numPages, MAX_PAGES);
    const images = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page     = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: RENDER_SCALE });

        const canvas  = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        images.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY));

        // Release page resources after rendering
        page.cleanup();
    }

    if (images.length === 0) {
        throw new Error('Nenhuma página pôde ser renderizada do PDF.');
    }

    return images;
}

// ── Internal helpers ──────────────────────────────────────────────────────

function _validate(file) {
    if (!(file instanceof File)) {
        throw new Error('Arquivo inválido.');
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Selecione um arquivo PDF (.pdf).');
    }
    if (file.size > MAX_PDF_BYTES) {
        throw new Error('PDF muito grande. O limite é 50 MB.');
    }
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js não carregado. Recarregue a página.');
    }
}
