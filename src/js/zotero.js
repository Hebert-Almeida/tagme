'use strict';

import { readSafeJSON, RateLimiter } from './security.js';

const ZOTERO_BASE = 'https://api.zotero.org';

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── ZoteroClient ──────────────────────────────────────────────────────────
// Handles all Zotero Web API communication.
// The API key lives only in a private field — never persisted to storage.
export class ZoteroClient {
    #apiKey;
    #userId;
    #limiter = new RateLimiter(30, 60_000); // 30 req/min

    constructor(apiKey, userId) {
        this.#apiKey  = String(apiKey).trim();
        this.#userId  = String(userId).trim();
    }

    // Wipe credentials from memory on logout / session end.
    destroy() {
        this.#apiKey  = '';
        this.#userId  = '';
    }

    get userId() { return this.#userId; }

    // ── Private ─────────────────────────────────────────────────────────

    #headers() {
        return {
            'Zotero-API-Key': this.#apiKey,
            'Zotero-API-Version': '3',
        };
    }

    #checkRate() {
        if (!this.#limiter.check()) {
            const secs = Math.ceil(this.#limiter.msUntilAvailable() / 1000);
            throw new Error(`Limite de requisições atingido. Aguarde ${secs}s e tente novamente.`);
        }
    }

    async #get(path, signal) {
        this.#checkRate();
        let res;
        try {
            res = await fetch(`${ZOTERO_BASE}${path}`, {
                headers: this.#headers(),
                mode: 'cors',
                signal,
            });
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            throw new Error(
                'Não foi possível contactar a API do Zotero. ' +
                'Verifique sua conexão com a internet.'
            );
        }
        return res;
    }

    // ── Public API ────────────────────────────────────────────────────────

    // Verifies the API key + userId are valid and have read access.
    async verifyConnection() {
        const res = await this.#get(`/users/${this.#userId}/items?limit=1`);

        if (res.status === 403) throw new Error('Chave de API inválida ou sem permissão de leitura.');
        if (res.status === 404) throw new Error('User ID não encontrado. Verifique o número informado.');
        if (!res.ok) throw new Error(`Erro de conexão com o Zotero (código ${res.status}).`);

        return true;
    }

    // Fetches a page of library items. sort/direction map directly to Zotero API params.
    async fetchItems(start = 0, limit = 20, { sort = 'dateAdded', direction = 'desc' } = {}) {
        const safeSort = ['dateAdded','dateModified','date','creator','title'].includes(sort) ? sort : 'dateAdded';
        const safeDir  = direction === 'asc' ? 'asc' : 'desc';

        const path = `/users/${this.#userId}/items/top?` +
            `itemType=-note` +
            `&start=${start}` +
            `&limit=${Math.min(limit, 50)}` +
            `&sort=${safeSort}&direction=${safeDir}`;

        const res = await this.#get(path);
        if (!res.ok) throw new Error(`Erro ao carregar artigos (${res.status}).`);

        const totalHeader = res.headers.get('Total-Results');
        const total = totalHeader ? parseInt(totalHeader, 10) : 0;

        const items = await readSafeJSON(res);
        if (!Array.isArray(items)) throw new Error('Formato inesperado na resposta da API Zotero.');

        return { items, total };
    }

    // Fetches all user collections (up to 200). Non-fatal on failure.
    async fetchCollections() {
        const res = await this.#get(`/users/${this.#userId}/collections?limit=200`);
        if (!res.ok) return [];

        const data = await readSafeJSON(res);
        return Array.isArray(data) ? data : [];
    }

    // Searches items by query term, collection, and sort order.
    async searchItems(term = '', collection = '', start = 0, limit = 20, { signal, sort = 'dateAdded', direction = 'desc' } = {}) {
        const safeSort = ['dateAdded','dateModified','date','creator','title'].includes(sort) ? sort : 'dateAdded';
        const safeDir  = direction === 'asc' ? 'asc' : 'desc';

        let path = `/users/${this.#userId}/items/top?itemType=-note` +
            `&start=${start}&limit=${Math.min(limit, 50)}&sort=${safeSort}&direction=${safeDir}`;

        if (term.trim()) path += `&q=${encodeURIComponent(term.trim())}&qmode=everything`;
        if (collection.trim()) path += `&collectionKey=${encodeURIComponent(collection.trim())}`;

        const res = await this.#get(path, signal);
        if (!res.ok) throw new Error(`Erro na busca (${res.status}).`);

        const total = parseInt(res.headers.get('Total-Results') ?? '0', 10);
        const items = await readSafeJSON(res);
        return { items: Array.isArray(items) ? items : [], total };
    }

    // Fetches a single item by key (used to get the latest version for updates).
    async fetchItem(key) {
        if (!/^[A-Z0-9]{8}$/i.test(key)) throw new Error('Chave de item inválida.');

        const res = await this.#get(`/users/${this.#userId}/items/${key}`);
        if (!res.ok) throw new Error(`Erro ao buscar item Zotero (${res.status}).`);

        return readSafeJSON(res);
    }

    // Writes selected tags (and optional summary note) back to a Zotero item.
    // Uses If-Unmodified-Since-Version for optimistic locking.
    async updateItemTagsAndSummary(key, newTags, summary) {
        if (!/^[A-Z0-9]{8}$/i.test(key)) throw new Error('Chave de item inválida.');

        const current = await this.fetchItem(key);
        const data = { ...current.data };

        // Merge new tags with existing ones (case-insensitive dedup)
        const existingLower = new Set((data.tags || []).map(t => t.tag.toLowerCase()));
        const merged = [...(data.tags || [])];

        for (const tag of newTags) {
            const clean = String(tag).replace(/[\n\r\t]/g, ' ').trim().slice(0, 255);
            if (clean && !existingLower.has(clean.toLowerCase())) {
                merged.push({ tag: clean });
            }
        }
        data.tags = merged;

        // PUT with optimistic-lock header
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
                        'If-Unmodified-Since-Version': String(current.version),
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

        if (summary) {
            await this.#createNote(key, summary);
        }

        return true;
    }

    // Creates a child note on the Zotero item (appears in the Notes tab).
    async #createNote(parentKey, summary) {
        const cleanSummary = String(summary)
            .replace(/\0/g, '')
            .trim()
            .slice(0, 2000);

        // Wrap in minimal HTML; Zotero renders note content as rich text.
        const escaped = escapeHTML(cleanSummary);
        const noteHtml =
            `<p><strong>[TagMe]</strong></p>` +
            `<p>${escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;

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
