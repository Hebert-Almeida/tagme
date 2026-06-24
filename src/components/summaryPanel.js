'use strict';

import { sanitizeText } from '../js/security.js';
import { showSkeleton, safeFromTo } from '../js/ui.js';

// ── SummaryPanel ──────────────────────────────────────────────────────────
// Editable textarea for the AI-generated summary. Users can tweak
// the text before exporting it to Zotero's "Extra" field.
export class SummaryPanel {
    #container;
    #value = '';

    constructor(container) {
        this.#container = container;
    }

    // ── Public API ────────────────────────────────────────────────────────

    showLoading() {
        showSkeleton(this.#container, 1, 'text');
    }

    render(text) {
        this.#value = sanitizeText(text);
        this.#container.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'summary-content';

        const label = document.createElement('label');
        label.setAttribute('for', 'summary-textarea');
        label.className = 'preview-label';
        label.textContent = 'Resumo (editável antes de exportar)';
        wrapper.appendChild(label);

        const ta = document.createElement('textarea');
        ta.id = 'summary-textarea';
        ta.className = 'summary-editable';
        ta.setAttribute('aria-label', 'Resumo editável do artigo');
        ta.setAttribute('aria-describedby', 'summary-tip');
        ta.rows = 6;
        ta.value = this.#value;

        ta.addEventListener('input', () => {
            this.#value = ta.value;
        });

        wrapper.appendChild(ta);

        const tip = document.createElement('p');
        tip.id = 'summary-tip';
        tip.className = 'field-hint';
        tip.textContent = 'Este resumo será salvo no campo "Extra" do item no Zotero.';
        wrapper.appendChild(tip);

        this.#container.appendChild(wrapper);

        safeFromTo(wrapper,
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }
        );
    }

    renderEmpty(reason = '') {
        this.#value = '';
        this.#container.innerHTML = '';

        const msg = document.createElement('p');
        msg.className = 's-body';
        msg.textContent = reason || 'Não foi possível gerar um resumo automático para este texto.';
        this.#container.appendChild(msg);
    }

    getValue() {
        return sanitizeText(this.#value);
    }
}
