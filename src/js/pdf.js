'use strict';

// Client-side PDF renderer. Pages are drawn to canvas and converted to
// JPEG data URLs for the AI vision API. No file content leaves the browser.

import { isSafeHttpsUrl } from './security.js';

export const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PAGES      = 4;                       // first N pages sent for vision analysis
const RENDER_SCALE   = 1.5;
const JPEG_QUALITY   = 0.78;

// Magic bytes: %PDF-  (0x25 0x50 0x44 0x46 0x2D)
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2D];

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

export async function renderPDFPages(file) {
    _validateFile(file);
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
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js não carregado. Recarregue a página.');
    }
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
    // past GC, and 4 pages at 1.5× scale can linger as tens of MB.
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
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js não carregado. Recarregue a página.');
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
