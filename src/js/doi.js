'use strict';

import { readSafeJSON, RateLimiter } from './security.js';

// CrossRef public API — polite pool via mailto header
const CROSSREF_BASE = 'https://api.crossref.org/works';

// SECURITY: 10 req/min — respects CrossRef's polite-pool guidelines
const _limiter = new RateLimiter(10, 60_000);

// Fetch metadata for a DOI from CrossRef.
// Returns a normalized metadata object — never raw API data.
//
// @param {string} doi - raw DOI string (e.g. "10.1000/xyz123")
// @returns {Promise<{
//   abstract: string,
//   title: string,
//   authors: string[],
//   year: number|null,
//   journal: string,
//   doi: string,
// }>}
export async function fetchDOIMetadata(doi) {
    if (!doi || typeof doi !== 'string') {
        throw new Error('DOI não fornecido.');
    }

    // SECURITY: rate limit check
    if (!_limiter.check()) {
        const secs = Math.ceil(_limiter.msUntilAvailable() / 1000);
        throw new Error(`Limite de requisições ao CrossRef atingido. Aguarde ${secs}s.`);
    }

    // SECURITY: encode the DOI to prevent URL injection.
    // Use ?select= to fetch only needed fields — prevents large reference lists
    // from exceeding the 512 KB response cap in readSafeJSON.
    // mailto= is the browser-compatible polite-pool identifier (User-Agent is
    // a forbidden header name in the Fetch API and cannot be set from browsers).
    const encoded = encodeURIComponent(doi.trim());
    const fields  = 'abstract,title,author,issued,published-print,published-online,container-title,DOI';
    const url = `${CROSSREF_BASE}/${encoded}?select=${fields}&mailto=contact@example.com`;

    const res = await fetch(url);

    if (res.status === 404) throw new Error('DOI não encontrado no CrossRef. Verifique o número.');
    if (res.status === 429) throw new Error('CrossRef: muitas requisições. Tente em alguns segundos.');
    if (!res.ok) throw new Error(`Erro ao consultar CrossRef (código ${res.status}).`);

    const data = await readSafeJSON(res);

    if (data?.status !== 'ok' || !data?.message) {
        throw new Error('Resposta inesperada do CrossRef.');
    }

    const work = data.message;

    // ── Extract abstract ──────────────────────────────────────────────────
    // CrossRef returns JATS XML in the abstract field; strip the markup.
    let abstract = '';
    if (typeof work.abstract === 'string' && work.abstract.length > 0) {
        abstract = work.abstract
            // Remove JATS title tags (e.g. <jats:title>Abstract</jats:title>)
            .replace(/<jats:title[^>]*>[\s\S]*?<\/jats:title>/gi, '')
            // Remove all other JATS tags
            .replace(/<\/?jats:[a-z-]+[^>]*>/gi, ' ')
            // Remove any remaining HTML tags
            .replace(/<[^>]+>/g, ' ')
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ── Authors ───────────────────────────────────────────────────────────
    const authors = Array.isArray(work.author)
        ? work.author
            .slice(0, 15)
            .map(a => [a.given, a.family].filter(Boolean).join(' '))
            .filter(Boolean)
        : [];

    // ── Publication year ──────────────────────────────────────────────────
    const year =
        work['published-print']?.['date-parts']?.[0]?.[0] ??
        work['published-online']?.['date-parts']?.[0]?.[0] ??
        work['issued']?.['date-parts']?.[0]?.[0] ??
        null;

    // ── Title ─────────────────────────────────────────────────────────────
    const title = Array.isArray(work.title) && work.title.length
        ? String(work.title[0])
        : (typeof work.title === 'string' ? work.title : '');

    // ── Journal ───────────────────────────────────────────────────────────
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
