// Client-side PDF renderer. Pages are drawn to canvas and converted to
// JPEG data URLs for the AI vision API. No file content leaves the browser.
//
// PDF.js (~330 KB) is loaded lazily on first PDF action via _ensurePDFLib(),
// keeping initial page load smaller for users who never touch a PDF.

import { isSafeHttpsUrl } from './security.js';

export const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_PAGES   = 4;        // First N pages sent to the AI (exposed for UI copy)
const RENDER_SCALE       = 1.2;      // Lowered from 1.5 — vision API doesn't benefit above this
const JPEG_QUALITY       = 0.7;      // Lowered from 0.78 — saves ~25 % payload, no visible drop

// Magic bytes: %PDF-  (0x25 0x50 0x44 0x46 0x2D)
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2D];

// ── Lazy PDF.js loader ────────────────────────────────────────────────────
const PDFJS_VERSION = '3.11.174';
const PDFJS_SCRIPT  = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`;
const PDFJS_WORKER  = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

let _pdfLibPromise = null;
function _ensurePDFLib() {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        return Promise.resolve();
    }
    if (_pdfLibPromise) return _pdfLibPromise;

    _pdfLibPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PDFJS_SCRIPT;
        s.async = true;
        s.onload = () => {
            if (typeof pdfjsLib === 'undefined') {
                reject(new Error('PDF.js carregou mas pdfjsLib não está disponível.'));
                return;
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
            resolve();
        };
        s.onerror = () => {
            _pdfLibPromise = null; // allow retry on transient failures
            reject(new Error('Não foi possível baixar o PDF.js. Verifique sua conexão.'));
        };
        document.head.appendChild(s);
    });
    return _pdfLibPromise;
}

export async function renderPDFPages(file) {
    _validateFile(file);
    await _ensurePDFLib();
    const arrayBuffer = await file.arrayBuffer();
    return _renderFromBuffer(arrayBuffer);
}

export async function renderPDFFromBuffer(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
        throw new Error('Buffer de PDF inválido.');
    }
    if (arrayBuffer.byteLength === 0) {
        throw new Error('PDF vazio.');
    }
    if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
        throw new Error('PDF muito grande. O limite é 50 MB.');
    }
    if (!_hasPDFMagic(arrayBuffer)) {
        throw new Error('O arquivo não parece ser um PDF válido.');
    }
    await _ensurePDFLib();
    return _renderFromBuffer(arrayBuffer);
}

export async function fetchAndRenderPDF(url) {
    if (typeof url !== 'string' || !isSafeHttpsUrl(url)) {
        throw new Error('Apenas URLs HTTPS são permitidas.');
    }

    let res;
    try {
        res = await fetch(url, { mode: 'cors', redirect: 'follow' });
    } catch {
        throw new Error('Não foi possível baixar o PDF diretamente. Abra em nova aba e arraste o arquivo.');
    }

    if (!res.ok) {
        throw new Error(`Falha ao baixar o PDF (código ${res.status}).`);
    }

    // Reject up-front if the server advertises an oversized body, so we don't
    // allocate the full ArrayBuffer just to throw later.
    const lengthHeader = res.headers.get('content-length');
    if (lengthHeader && parseInt(lengthHeader, 10) > MAX_PDF_BYTES) {
        throw new Error('PDF muito grande. O limite é 50 MB.');
    }

    const buffer = await res.arrayBuffer();
    return renderPDFFromBuffer(buffer);
}

// ── Internal helpers ──────────────────────────────────────────────────────

async function _renderFromBuffer(arrayBuffer) {
    let pdf;
    try {
        pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch {
        throw new Error(
            'Não foi possível abrir o PDF. O arquivo pode estar corrompido ou protegido por senha.'
        );
    }

    const numPages = Math.min(pdf.numPages, MAX_PAGES);

    const images = await Promise.all(
        Array.from({ length: numPages }, (_, i) => _renderPage(pdf, i + 1))
    );

    if (images.length === 0) {
        throw new Error('Nenhuma página pôde ser renderizada do PDF.');
    }

    return images;
}

async function _renderPage(pdf, pageNum) {
    const page     = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas  = document.createElement('canvas');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

    // Explicitly drop the canvas backing store — Safari/iOS hold onto it
    // past GC, and 4 pages can linger as tens of MB.
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();

    return dataUrl;
}

function _validateFile(file) {
    if (!(file instanceof File) && !(file instanceof Blob)) {
        throw new Error('Arquivo inválido.');
    }
    const name = typeof file.name === 'string' ? file.name.toLowerCase() : '';
    if (name && !name.endsWith('.pdf')) {
        throw new Error('Selecione um arquivo PDF (.pdf).');
    }
    // MIME type is advisory — browsers can't always be trusted, but reject
    // the obvious mismatches. Empty string is allowed (some OSes omit it).
    if (file.type && file.type !== 'application/pdf') {
        throw new Error('Tipo de arquivo inválido. Envie um PDF.');
    }
    if (file.size > MAX_PDF_BYTES) {
        throw new Error('PDF muito grande. O limite é 50 MB.');
    }
    if (file.size === 0) {
        throw new Error('O arquivo está vazio.');
    }
}

function _hasPDFMagic(buffer) {
    if (buffer.byteLength < PDF_MAGIC.length) return false;
    const view = new Uint8Array(buffer, 0, PDF_MAGIC.length);
    for (let i = 0; i < PDF_MAGIC.length; i++) {
        if (view[i] !== PDF_MAGIC[i]) return false;
    }
    return true;
}
