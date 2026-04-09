'use strict';

import { readSafeJSON, RateLimiter } from './security.js';

// CrossRef public API — polite pool via mailto header
const CROSSREF_BASE = 'https://api.crossref.org/works';

// 10 req/min — respects CrossRef's polite-pool guidelines
const _limiter = new RateLimiter(10, 60_000);

/**
 * Fetch metadata for a DOI from CrossRef.
 * Returns a normalized metadata object — never raw API data.
 *
 * @param {string} doi
 * @returns {Promise<{ abstract, title, authors, year, journal, doi }>}
 */
export async function fetchDOIMetadata(doi) {
    if (!doi || typeof doi !== 'string') {
        throw new Error('DOI não fornecido.');
    }

    if (!_limiter.check()) {
        const secs = Math.ceil(_limiter.msUntilAvailable() / 1000);
        throw new Error(`Limite de requisições ao CrossRef atingido. Aguarde ${secs}s.`);
    }

    // Encode the DOI.
    // This also keeps the response well under the 512 KB cap in readSafeJSON.
    const encoded = encodeURIComponent(doi.trim());
    const url = `${CROSSREF_BASE}/${encoded}`;

    let res;
    try {
        res = await fetch(url, { mode: 'cors' });
    } catch {
        throw new Error(
            'Não foi possível contactar o CrossRef. ' +
            'Verifique sua conexão ou tente inserir o texto manualmente.'
        );
    }

    if (res.status === 404) {
        throw new Error('DOI não encontrado no CrossRef. Verifique o número e tente inserir o abstract manualmente.');
    }
    if (res.status === 429) {
        throw new Error('CrossRef: muitas requisições. Aguarde alguns segundos e tente novamente.');
    }
    if (res.status === 406) {
        throw new Error('CrossRef não retornou metadados para este DOI. Insira o texto manualmente.');
    }
    if (!res.ok) {
        throw new Error(`Erro ao consultar CrossRef (código ${res.status}). Tente inserir o texto manualmente.`);
    }

    const data = await readSafeJSON(res);

    if (data?.status !== 'ok' || !data?.message) {
        throw new Error('Resposta inesperada do CrossRef. Tente inserir o texto manualmente.');
    }

    const work = data.message;

    // CrossRef returns JATS XML in the abstract field — strip the markup.
    let abstract = '';
    if (typeof work.abstract === 'string' && work.abstract.length > 0) {
        abstract = work.abstract
            .replace(/<jats:title[^>]*>[\s\S]*?<\/jats:title>/gi, '')
            .replace(/<\/?jats:[a-z-]+[^>]*>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const authors = Array.isArray(work.author)
        ? work.author
            .slice(0, 15)
            .map(a => [a.given, a.family].filter(Boolean).join(' '))
            .filter(Boolean)
        : [];

    // Try published-print → published-online → issued (in order of reliability)
    const year =
        work['published-print']?.['date-parts']?.[0]?.[0] ??
        work['published-online']?.['date-parts']?.[0]?.[0] ??
        work['issued']?.['date-parts']?.[0]?.[0] ??
        null;

    const title = Array.isArray(work.title) && work.title.length
        ? String(work.title[0])
        : (typeof work.title === 'string' ? work.title : '');

    const containerTitle = work['container-title'];
    const journal = Array.isArray(containerTitle) && containerTitle.length
        ? String(containerTitle[0])
        : (typeof containerTitle === 'string' ? containerTitle : '');

    return {
        abstract,
        title,
        authors,
        year: year ? Number(year) : null,
        journal,
        doi: doi.trim(),
    };
}
