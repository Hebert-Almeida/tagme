'use strict';

// SECURITY: PDF files are processed entirely client-side.
// No file content is uploaded or sent to any server.
// Text is extracted locally by PDF.js and then passed to the AI module.

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB — reasonable upper bound
const MAX_PAGES     = 30;               // avoid hanging on very long documents
const MAX_CHARS     = 6_000;            // cap before handing off to AI

// Configure the PDF.js worker once at module load time.
// pdfjsLib is loaded as a global <script> before this module.
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

/**
 * Extract plain text from a PDF File object.
 * @param {File} file
 * @returns {Promise<string>} extracted text, capped at MAX_CHARS
 */
export async function extractPDFText(file) {
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

    const arrayBuffer = await file.arrayBuffer();

    let pdf;
    try {
        // disableWorker: false — use the CDN worker configured above
        pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch {
        throw new Error('Não foi possível abrir o PDF. O arquivo pode estar corrompido ou protegido por senha.');
    }

    const numPages = Math.min(pdf.numPages, MAX_PAGES);
    const pageTexts = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page    = await pdf.getPage(pageNum);
        const content = await page.getTextContent();

        // Join text items; preserve word boundaries
        const text = content.items
            .map(item => item.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (text.length > 0) pageTexts.push(text);
    }

    const fullText = pageTexts.join('\n\n').slice(0, MAX_CHARS);

    if (fullText.trim().length < 80) {
        throw new Error(
            'Texto insuficiente extraído do PDF. ' +
            'O arquivo pode conter apenas imagens (PDF escaneado). ' +
            'Tente inserir o texto manualmente.'
        );
    }

    return fullText;
}
