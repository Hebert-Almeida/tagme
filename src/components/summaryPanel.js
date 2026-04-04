'use strict';

import { sanitizeText } from '../js/security.js';
import { showSkeleton } from '../js/ui.js';

// ── SummaryPanel ──────────────────────────────────────────────────────────
// Displays and allows editing of the AI-generated article summary.
// Uses a contenteditable textarea so the user can tweak before exporting.
export class SummaryPanel {
    #container; // HTMLElement — the summary-content div
    #value = '';

    constructor(container) {
        this.#container = container;
    }

    // ── Public API ────────────────────────────────────────────────────────

    // Show a loading skeleton while the summary is being "generated"
    showLoading() {
        showSkeleton(this.#container, 1, 'text');
    }

    // Render the generated summary with an editable textarea.
    // @param text - the summary string from ai.generateAnalysis()
    render(text) {
        this.#value = sanitizeText(text);
        this.#container.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'summary-content';

        // Label
        const label = document.createElement('label');
        label.setAttribute('for', 'summary-textarea');
        label.className = 'preview-label';
        label.textContent = 'Resumo (editável antes de exportar)';
        wrapper.appendChild(label);

        // Editable textarea
        const ta = document.createElement('textarea');
        ta.id = 'summary-textarea';
        ta.className = 'summary-editable';
        ta.setAttribute('aria-label', 'Resumo editável do artigo');
        ta.setAttribute('aria-describedby', 'summary-tip');
        ta.rows = 6;
        // SECURITY: setting .value (not innerHTML) to avoid XSS
        ta.value = this.#value;

        ta.addEventListener('input', () => {
            this.#value = ta.value;
        });

        wrapper.appendChild(ta);

        // Helper tip
        const tip = document.createElement('p');
        tip.id = 'summary-tip';
        tip.className = 'field-hint';
        tip.textContent = 'Este resumo será salvo no campo "Extra" do item no Zotero.';
        wrapper.appendChild(tip);

        this.#container.appendChild(wrapper);

        // Animate in
        gsap.fromTo(wrapper,
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }
        );
    }

    // Render an empty/fallback state when summary generation fails
    renderEmpty(reason = '') {
        this.#value = '';
        this.#container.innerHTML = '';

        const msg = document.createElement('p');
        msg.className = 's-body';
        msg.textContent = reason || 'Não foi possível gerar um resumo automático para este texto.';
        this.#container.appendChild(msg);
    }

    // Return the current (possibly edited) summary text.
    getValue() {
        return sanitizeText(this.#value);
    }
}
