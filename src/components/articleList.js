'use strict';

import { sanitizeText } from '../js/security.js';
import { showSkeleton, animateCards } from '../js/ui.js';

// ── ArticleList ───────────────────────────────────────────────────────────
// Renders a paginated list of Zotero article cards.
// All DOM content is built via the DOM API (no innerHTML with user data).
export class ArticleList {
    #container;
    #paginationEl;
    #countEl;
    #onSelect;
    #items = [];
    #total = 0;
    #page = 0;
    #perPage;
    #selectedKey = null;

    constructor(container, paginationEl, countEl, onSelect, perPage = 20) {
        this.#container    = container;
        this.#paginationEl = paginationEl;
        this.#countEl      = countEl;
        this.#onSelect     = onSelect;
        this.#perPage      = perPage;
    }

    // ── Public API ────────────────────────────────────────────────────────

    showLoading() {
        showSkeleton(this.#container, 8, 'article');
        this.#paginationEl.hidden = true;
    }

    render(items, total, page = 0) {
        this.#items = items;
        this.#total = total;
        this.#page  = page;

        this._renderCards();
        this._renderPagination();
        this._updateCount();
    }

    setSelected(key) {
        this.#selectedKey = key;
        this.#container.querySelectorAll('.article-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.key === key);
            card.setAttribute('aria-pressed',
                card.dataset.key === key ? 'true' : 'false');
        });
    }

    get currentPage() { return this.#page; }

    // ── Private ───────────────────────────────────────────────────────────

    _renderCards() {
        this.#container.innerHTML = '';

        if (this.#items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'articles-empty';
            empty.setAttribute('role', 'status');
            empty.textContent = 'Nenhum artigo encontrado. Tente outro termo de busca.';
            this.#container.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();

        this.#items.forEach(item => {
            const card = this._buildCard(item);
            fragment.appendChild(card);
        });

        this.#container.appendChild(fragment);
        animateCards(this.#container.querySelectorAll('.article-card'));
    }

    _buildCard(item) {
        const data = item.data || {};

        const title = sanitizeText(data.title) || '(sem título)';

        const creators = (data.creators || []).slice(0, 3);
        const authorStr = creators
            .map(c => sanitizeText([c.firstName, c.lastName].filter(Boolean).join(' ')))
            .filter(Boolean)
            .join(', ')
            + (data.creators?.length > 3 ? ' et al.' : '');

        const year = data.date
            ? new Date(String(data.date)).getFullYear()
            : null;

        const journal = sanitizeText(data.publicationTitle || '');
        const existingTags = (data.tags || []).slice(0, 4);

        const card = document.createElement('article');
        card.className = 'article-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', title);
        card.setAttribute('aria-pressed', item.key === this.#selectedKey ? 'true' : 'false');
        card.dataset.key = item.key;

        const titleEl = document.createElement('p');
        titleEl.className = 'article-card__title';
        titleEl.textContent = title;
        card.appendChild(titleEl);

        const metaParts = [
            authorStr || null,
            year ? String(year) : null,
            journal || null,
        ].filter(Boolean);

        if (metaParts.length) {
            const metaEl = document.createElement('p');
            metaEl.className = 'article-card__meta';
            metaEl.textContent = metaParts.join(' · ');
            card.appendChild(metaEl);
        }

        if (existingTags.length) {
            const tagsWrap = document.createElement('div');
            tagsWrap.className = 'article-card__tags';
            tagsWrap.setAttribute('aria-label', 'Tags existentes');
            existingTags.forEach(t => {
                const chip = document.createElement('span');
                chip.className = 'article-card__tag';
                chip.textContent = sanitizeText(t.tag);
                tagsWrap.appendChild(chip);
            });
            card.appendChild(tagsWrap);
        }

        card.addEventListener('click', () => this._handleSelect(item, card));
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._handleSelect(item, card);
            }
        });

        if (item.key === this.#selectedKey) {
            card.classList.add('selected');
        }

        return card;
    }

    _handleSelect(item, card) {
        this.setSelected(item.key);
        this.#onSelect(item);
    }

    _renderPagination() {
        this.#paginationEl.innerHTML = '';
        const totalPages = Math.ceil(this.#total / this.#perPage);

        if (totalPages <= 1) {
            this.#paginationEl.hidden = true;
            return;
        }

        this.#paginationEl.hidden = false;

        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Anterior';
        prevBtn.disabled = this.#page === 0;
        prevBtn.setAttribute('aria-label', 'Página anterior');
        prevBtn.addEventListener('click', () => {
            if (this.#page > 0) this.#onSelect({ _paginate: this.#page - 1 });
        });

        const info = document.createElement('span');
        info.className = 'pagination-info';
        info.textContent = `${this.#page + 1} / ${totalPages}`;

        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Próxima →';
        nextBtn.disabled = this.#page >= totalPages - 1;
        nextBtn.setAttribute('aria-label', 'Próxima página');
        nextBtn.addEventListener('click', () => {
            if (this.#page < totalPages - 1) this.#onSelect({ _paginate: this.#page + 1 });
        });

        this.#paginationEl.append(prevBtn, info, nextBtn);
    }

    _updateCount() {
        if (!this.#countEl) return;
        this.#countEl.textContent =
            this.#total === 0
                ? 'Sem artigos'
                : `${this.#total} artigo${this.#total !== 1 ? 's' : ''}`;
    }
}
