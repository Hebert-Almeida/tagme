'use strict';

import { readSafeJSON, RateLimiter } from './security.js';

const ZOTERO_BASE = 'https://api.zotero.org';

// ── ZoteroClient ──────────────────────────────────────────────────────────
// All Zotero Web API communication lives here.
// SECURITY: API key is stored only in memory (private field), never in
//           localStorage, sessionStorage, or any persistent store.
export class ZoteroClient {
    // SECURITY: private fields prevent accidental exposure
    #apiKey;
    #userId;
    // SECURITY: 30 requests/minute to prevent accidental rate abuse
    #limiter = new RateLimiter(30, 60_000);

    constructor(apiKey, userId) {
        this.#apiKey  = String(apiKey).trim();
        this.#userId  = String(userId).trim();
    }

    // SECURITY: wipe credentials from memory on logout / session end
    destroy() {
        this.#apiKey  = '';
        this.#userId  = '';
    }

    get userId() { return this.#userId; }

    // ── Private helpers ───────────────────────────────────────────────────

    #headers() {
        return {
            'Zotero-API-Key': this.#apiKey,
            'Zotero-API-Version': '3',
        };
    }

    // SECURITY: throws a user-friendly error if rate limit exceeded
    #checkRate() {
        if (!this.#limiter.check()) {
            const secs = Math.ceil(this.#limiter.msUntilAvailable() / 1000);
            throw new Error(`Limite de requisições atingido. Aguarde ${secs}s e tente novamente.`);
        }
    }

    async #get(path) {
        this.#checkRate();
        let res;
        try {
            res = await fetch(`${ZOTERO_BASE}${path}`, {
                headers: this.#headers(),
                mode: 'cors',
            });
        } catch {
            throw new Error(
                'Não foi possível contactar a API do Zotero. ' +
                'Verifique sua conexão com a internet.'
            );
        }
        return res;
    }

    // ── Public API ────────────────────────────────────────────────────────

    // Test that the API key + userId are valid and have read access.
    async verifyConnection() {
        const res = await this.#get(`/users/${this.#userId}/items?limit=1`);

        if (res.status === 403) throw new Error('Chave de API inválida ou sem permissão de leitura.');
        if (res.status === 404) throw new Error('User ID não encontrado. Verifique o número informado.');
        if (!res.ok) throw new Error(`Erro de conexão com o Zotero (código ${res.status}).`);

        return true;
    }

    // Fetch a page of journal articles from the library.
    // Returns: { items: ZoteroItem[], total: number }
    async fetchItems(start = 0, limit = 20) {
        const path = `/users/${this.#userId}/items?` +
            `itemType=journalArticle` +
            `&start=${start}` +
            `&limit=${Math.min(limit, 50)}` +
            `&sort=date&direction=desc`;

        const res = await this.#get(path);
        if (!res.ok) throw new Error(`Erro ao carregar artigos (${res.status}).`);

        const totalHeader = res.headers.get('Total-Results');
        const total = totalHeader ? parseInt(totalHeader, 10) : 0;

        const items = await readSafeJSON(res);
        if (!Array.isArray(items)) throw new Error('Formato inesperado na resposta da API Zotero.');

        return { items, total };
    }

    // Fetch all collections for the user (up to 200).
    async fetchCollections() {
        const res = await this.#get(`/users/${this.#userId}/collections?limit=200`);
        if (!res.ok) return [];   // non-fatal — library can work without collections

        const data = await readSafeJSON(res);
        return Array.isArray(data) ? data : [];
    }

    // Search items by query term and/or collection key.
    // @param term       - search string (empty = no text filter)
    // @param collection - collection key (empty = all collections)
    // @param start      - pagination offset
    // @param limit      - page size
    async searchItems(term = '', collection = '', start = 0, limit = 20) {
        let path = `/users/${this.#userId}/items?itemType=journalArticle` +
            `&start=${start}&limit=${Math.min(limit, 50)}&sort=date&direction=desc`;

        // SECURITY: encode user-supplied strings before embedding in URL
        if (term.trim()) path += `&q=${encodeURIComponent(term.trim())}`;
        if (collection.trim()) path += `&collectionKey=${encodeURIComponent(collection.trim())}`;

        const res = await this.#get(path);
        if (!res.ok) throw new Error(`Erro na busca (${res.status}).`);

        const total = parseInt(res.headers.get('Total-Results') ?? '0', 10);
        const items = await readSafeJSON(res);
        return { items: Array.isArray(items) ? items : [], total };
    }

    // Fetch a single item by key (needed to get current version before updating).
    async fetchItem(key) {
        // SECURITY: validate key format before embedding in URL
        if (!/^[A-Z0-9]{8}$/i.test(key)) throw new Error('Chave de item inválida.');

        const res = await this.#get(`/users/${this.#userId}/items/${key}`);
        if (!res.ok) throw new Error(`Erro ao buscar item Zotero (${res.status}).`);

        return readSafeJSON(res);
    }

    // Write selected tags and an optional summary back to a Zotero item.
    // Uses optimistic-locking via If-Unmodified-Since-Version to avoid conflicts.
    async updateItemTagsAndSummary(key, version, newTags, summary) {
        this.#checkRate();

        // SECURITY: validate key format
        if (!/^[A-Z0-9]{8}$/i.test(key)) throw new Error('Chave de item inválida.');

        // Fetch fresh data to get latest version & current fields
        const current = await this.fetchItem(key);
        const data = { ...current.data };

        // ── Merge tags ────────────────────────────────────────────────────
        const existingLower = new Set((data.tags || []).map(t => t.tag.toLowerCase()));
        const merged = [...(data.tags || [])];

        for (const tag of newTags) {
            // SECURITY: sanitize each tag string before writing
            const clean = String(tag).replace(/[\n\r\t]/g, ' ').trim().slice(0, 255);
            if (clean && !existingLower.has(clean.toLowerCase())) {
                merged.push({ tag: clean });
            }
        }
        data.tags = merged;

        // ── PUT request with optimistic-lock header ────────────────────────
        this.#checkRate();
        let res;
        try {
            res = await fetch(
                `${ZOTERO_BASE}/users/${this.#userId}/items/${key}`,
                {
                    method: 'PUT',
                    mode: 'cors',
                    headers: {
                        ...this.#headers(),
                        'Content-Type': 'application/json',
                        // SECURITY: optimistic-lock prevents overwriting concurrent edits
                        'If-Unmodified-Since-Version': String(version),
                    },
                    body: JSON.stringify(data),
                }
            );
        } catch {
            throw new Error(
                'Falha de rede ao exportar para o Zotero. ' +
                'Verifique sua conexão e tente novamente.'
            );
        }

        if (res.status === 412) {
            throw new Error('O item foi modificado no Zotero por outra sessão. Recarregue e tente novamente.');
        }
        if (res.status === 403) {
            throw new Error('Sem permissão de escrita. Verifique se sua chave de API tem acesso de escrita.');
        }
        if (!res.ok) {
            throw new Error(`Falha ao exportar para o Zotero (código ${res.status}).`);
        }

        // ── Create note in Notes tab ──────────────────────────────────────
        if (summary) {
            await this.#createNote(key, summary);
        }

        return true;
    }

    // Create a child note on a Zotero item (appears in the Notes tab).
    async #createNote(parentKey, summary) {
        // SECURITY: sanitize summary text before writing
        const cleanSummary = String(summary)
            .replace(/\0/g, '')
            .trim()
            .slice(0, 2000);

        // Wrap in minimal HTML; Zotero renders note content as rich text.
        const noteHtml =
            `<p><strong>[TagMe]</strong></p>` +
            `<p>${cleanSummary.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;

        this.#checkRate();
        let res;
        try {
            res = await fetch(`${ZOTERO_BASE}/users/${this.#userId}/items`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    ...this.#headers(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify([{
                    itemType: 'note',
                    parentItem: parentKey,
                    note: noteHtml,
                    tags: [],
                    collections: [],
                    relations: {},
                }]),
            });
        } catch {
            // Note creation failure is non-fatal — tags were already saved
            throw new Error('Tags exportadas, mas falha ao criar nota no Zotero. Verifique sua conexão.');
        }

        if (res.status === 403) {
            throw new Error('Tags exportadas, mas sem permissão para criar notas. Verifique as permissões da sua chave de API.');
        }
        if (!res.ok) {
            throw new Error(`Tags exportadas, mas falha ao criar nota (código ${res.status}).`);
        }
    }
}
