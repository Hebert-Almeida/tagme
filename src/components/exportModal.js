'use strict';

import { sanitizeText } from '../js/security.js';
import { celebrateExport, safeFromTo, safeTo } from '../js/ui.js';

// ── ExportModal ───────────────────────────────────────────────────────────
// Confirmation modal shown before writing tags/summary to Zotero.
// Displays a preview of what will be exported and handles the async write.
export class ExportModal {
    #slot;
    #onConfirm;
    #onCancel;

    constructor(slot, onConfirm, onCancel) {
        this.#slot      = slot;
        this.#onConfirm = onConfirm;
        this.#onCancel  = onCancel;
    }

    // ── Public API ────────────────────────────────────────────────────────

    show(tags, summary) {
        this.#slot.innerHTML = '';

        const modal = this._buildModal(tags, summary);
        this.#slot.appendChild(modal);
        this.#slot.hidden = false;

        const confirmBtn = modal.querySelector('[data-action="confirm"]');
        confirmBtn?.focus();

        this._escHandler = (e) => {
            if (e.key === 'Escape') this._dismiss();
        };
        document.addEventListener('keydown', this._escHandler);

        safeFromTo(modal,
            { scale: 0.92, opacity: 0, y: 16 },
            { scale: 1, opacity: 1, y: 0, duration: 0.38, ease: 'back.out(1.5)' }
        );
    }

    showSuccess(tagCount) {
        const modal = this.#slot.querySelector('.export-modal');
        if (!modal) return;

        const success = document.createElement('div');
        success.className = 'export-success';

        const icon = document.createElement('div');
        icon.className = 'export-success__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '✓';

        const title = document.createElement('p');
        title.className = 'export-success__title';
        title.textContent = 'Exportado com sucesso!';

        const line1 = document.createElement('p');
        line1.className = 'export-success__line';
        line1.textContent = `${tagCount} tag${tagCount !== 1 ? 's' : ''} adicionada${tagCount !== 1 ? 's' : ''} ao item no Zotero.`;

        const line2 = document.createElement('p');
        line2.className = 'export-success__line';
        line2.textContent = 'Resumo salvo no campo "Extra" do item.';

        const closeBtn = document.createElement('button');
        closeBtn.className = 's-cta';
        closeBtn.textContent = 'Concluído';
        closeBtn.setAttribute('data-action', 'close');
        closeBtn.addEventListener('click', () => this._close());

        success.append(icon, title, line1, line2, closeBtn);

        const swap = () => {
            modal.innerHTML = '';
            modal.appendChild(success);
            gsap.set(modal, { opacity: 1, scale: 1 });
            celebrateExport(modal);
            closeBtn.focus();
        };

        safeTo(modal, {
            opacity: 0, scale: 0.95, duration: 0.2, ease: 'power2.in',
            onComplete: swap,
        });
    }

    showError(message) {
        const modal = this.#slot.querySelector('.export-modal');
        if (!modal) return;

        modal.querySelector('.modal-error')?.remove();

        const err = document.createElement('p');
        err.className = 'inline-error modal-error';
        err.setAttribute('role', 'alert');
        err.textContent = sanitizeText(message);

        const actions = modal.querySelector('.export-modal__actions');
        if (actions) {
            modal.insertBefore(err, actions);
        } else {
            modal.appendChild(err);
        }

        const confirmBtn = modal.querySelector('[data-action="confirm"]');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Tentar novamente';
        }
    }

    // ── Private ───────────────────────────────────────────────────────────

    _buildModal(tags, summary) {
        const modal = document.createElement('div');
        modal.className = 'export-modal';

        const title = document.createElement('h2');
        title.className = 'export-modal__title';
        title.textContent = 'Confirmar exportação para Zotero';
        modal.appendChild(title);

        if (tags.length > 0) {
            const tagsLabel = document.createElement('p');
            tagsLabel.className = 'export-modal__section-label';
            tagsLabel.textContent = `Tags a exportar (${tags.length})`;

            const tagsWrap = document.createElement('div');
            tagsWrap.className = 'export-modal__tags';
            tagsWrap.setAttribute('aria-label', 'Lista de tags a exportar');

            tags.forEach(tag => {
                const pill = document.createElement('span');
                pill.className = 'preview-tag';
                pill.textContent = sanitizeText(tag);
                tagsWrap.appendChild(pill);
            });

            modal.append(tagsLabel, tagsWrap);
        }

        if (summary) {
            const sumLabel = document.createElement('p');
            sumLabel.className = 'export-modal__section-label';
            sumLabel.textContent = 'Resumo a exportar (campo Extra)';

            const sumBox = document.createElement('div');
            sumBox.className = 'export-modal__summary';
            sumBox.textContent = sanitizeText(summary);

            modal.append(sumLabel, sumBox);
        }

        const actions = document.createElement('div');
        actions.className = 'export-modal__actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-ghost';
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.setAttribute('data-action', 'cancel');
        cancelBtn.addEventListener('click', () => this._dismiss());

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 's-cta';
        confirmBtn.textContent = 'Exportar agora';
        confirmBtn.setAttribute('data-action', 'confirm');
        confirmBtn.addEventListener('click', () => this._handleConfirm(confirmBtn, tags.length));

        actions.append(cancelBtn, confirmBtn);
        modal.appendChild(actions);

        return modal;
    }

    async _handleConfirm(btn, tagCount) {
        btn.disabled = true;
        btn.textContent = 'Exportando…';

        try {
            await this.#onConfirm();
            this.showSuccess(tagCount);
        } catch (err) {
            this.showError(err.message || 'Erro desconhecido ao exportar.');
        }
    }

    _dismiss() {
        // Cleanup the ESC listener up-front so a second ESC during the exit
        // animation can't trigger _dismiss again on the same (in-flight) modal.
        this._cleanup();
        const modalEl = this.#slot.querySelector('.export-modal');

        const done = () => {
            this.#slot.hidden = true;
            this.#slot.innerHTML = '';
            this.#onCancel?.();
        };

        if (!modalEl) { done(); return; }

        safeTo(modalEl, {
            scale: 0.93, opacity: 0, duration: 0.22, ease: 'power2.in',
            onComplete: done,
        });
    }

    _close() {
        this._cleanup();
        this.#slot.hidden = true;
        this.#slot.innerHTML = '';
    }

    _cleanup() {
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    }
}
