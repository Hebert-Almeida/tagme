'use strict';

import { sanitizeText } from '../js/security.js';
import { pulseChip, bindCursorTargets } from '../js/ui.js';

// ── TagSelector ───────────────────────────────────────────────────────────
// Renders semantic tag blocks (groups) with individual toggleable chips.
// Manages its own selection Set and exposes it via getSelectedTags().
export class TagSelector {
    #blocksContainer;  // HTMLElement — the tag-blocks div
    #previewContainer; // HTMLElement — the selected-tags-preview div
    #countEl;          // HTMLElement — badge showing count
    #selected = new Set();

    // @param blocksContainer  - element to render the block groups into
    // @param previewContainer - element to render selected tag pills into
    // @param countEl          - element to update with selection count
    constructor(blocksContainer, previewContainer, countEl) {
        this.#blocksContainer  = blocksContainer;
        this.#previewContainer = previewContainer;
        this.#countEl          = countEl;
    }

    // ── Public API ────────────────────────────────────────────────────────

    // Populate the selector with AI-generated tag blocks.
    // @param tagBlocks - Array<{ name: string, tags: string[] }>
    init(tagBlocks) {
        this.#selected.clear();
        this.#blocksContainer.innerHTML = '';

        const fragment = document.createDocumentFragment();

        tagBlocks.forEach((block, blockIdx) => {
            const el = this._buildBlock(block, blockIdx);
            fragment.appendChild(el);
        });

        this.#blocksContainer.appendChild(fragment);

        // Animate blocks in with GSAP stagger
        const blocks = this.#blocksContainer.querySelectorAll('.tag-block');
        gsap.fromTo(Array.from(blocks),
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.38, ease: 'power3.out', stagger: 0.07 }
        );

        this._updatePreview();
        bindCursorTargets();
    }

    // Return array of currently selected tag strings.
    getSelectedTags() {
        return [...this.#selected];
    }

    // Return the count of selected tags.
    get count() { return this.#selected.size; }

    // ── Private ───────────────────────────────────────────────────────────

    _buildBlock(block, blockIdx) {
        const blockEl = document.createElement('div');
        blockEl.className = 'tag-block';
        blockEl.dataset.block = String(blockIdx);

        // ── Block header ───────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'tag-block__header';

        const nameEl = document.createElement('span');
        nameEl.className = 'tag-block__name';
        nameEl.textContent = sanitizeText(block.name);

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'tag-block__toggle';
        toggleBtn.setAttribute('aria-label', `Selecionar todas as tags de ${sanitizeText(block.name)}`);
        toggleBtn.textContent = 'Selecionar tudo';
        toggleBtn.addEventListener('click', () => {
            this._toggleBlock(block.tags, blockEl, toggleBtn);
        });

        header.appendChild(nameEl);
        header.appendChild(toggleBtn);
        blockEl.appendChild(header);

        // ── Chips container ────────────────────────────────────────────
        const chips = document.createElement('div');
        chips.className = 'tag-block__chips';
        chips.setAttribute('role', 'group');
        chips.setAttribute('aria-label', `Tags de ${sanitizeText(block.name)}`);

        block.tags.forEach(tag => {
            const chip = this._buildChip(tag);
            chips.appendChild(chip);
        });

        blockEl.appendChild(chips);
        return blockEl;
    }

    _buildChip(tag) {
        const clean = sanitizeText(tag);

        const chip = document.createElement('button');
        chip.className = 'tag-chip';
        chip.dataset.tag = clean;
        chip.setAttribute('role', 'checkbox');
        chip.setAttribute('aria-checked', 'false');
        chip.setAttribute('aria-label', clean);

        // Check indicator (●/✓)
        const check = document.createElement('span');
        check.className = 'chip-check';
        check.setAttribute('aria-hidden', 'true');

        // Label text
        const label = document.createElement('span');
        label.className = 'chip-label';
        label.textContent = clean;

        chip.appendChild(check);
        chip.appendChild(label);

        chip.addEventListener('click', () => this._toggleChip(chip, clean));
        chip.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._toggleChip(chip, clean);
            }
        });

        return chip;
    }


    _toggleChip(chip, tag) {
        const isSelected = this.#selected.has(tag);

        if (isSelected) {
            this.#selected.delete(tag);
            chip.classList.remove('selected');
            chip.setAttribute('aria-checked', 'false');
        } else {
            this.#selected.add(tag);
            chip.classList.add('selected');
            chip.setAttribute('aria-checked', 'true');
        }

        pulseChip(chip);
        this._updatePreview();
        this._updateBlockToggleLabel(chip);
    }

    _toggleBlock(tags, blockEl, toggleBtn) {
        const allSelected = tags.every(t => this.#selected.has(t));

        if (allSelected) {
            // Deselect all in this block
            tags.forEach(t => this.#selected.delete(t));
            blockEl.querySelectorAll('.tag-chip').forEach(chip => {
                chip.classList.remove('selected');
                chip.setAttribute('aria-checked', 'false');
            });
            toggleBtn.textContent = 'Selecionar tudo';
            toggleBtn.setAttribute('aria-label',
                `Selecionar todas as tags de ${blockEl.querySelector('.tag-block__name').textContent}`);
        } else {
            // Select all in this block
            tags.forEach(t => this.#selected.add(sanitizeText(t)));
            blockEl.querySelectorAll('.tag-chip').forEach(chip => {
                chip.classList.add('selected');
                chip.setAttribute('aria-checked', 'true');
            });
            toggleBtn.textContent = 'Desmarcar tudo';
            toggleBtn.setAttribute('aria-label',
                `Desmarcar todas as tags de ${blockEl.querySelector('.tag-block__name').textContent}`);
        }

        this._updatePreview();
    }

    _updateBlockToggleLabel(chip) {
        const blockEl = chip.closest('.tag-block');
        if (!blockEl) return;
        const allChips = blockEl.querySelectorAll('.tag-chip');
        const allSelected = [...allChips].every(c => c.classList.contains('selected'));
        const toggleBtn = blockEl.querySelector('.tag-block__toggle');
        if (!toggleBtn) return;
        toggleBtn.textContent = allSelected ? 'Desmarcar tudo' : 'Selecionar tudo';
    }

    _updatePreview() {
        const preview   = this.#previewContainer;
        const countEl   = this.#countEl;

        preview.innerHTML = '';

        if (this.#selected.size === 0) {
            const empty = document.createElement('span');
            empty.className = 'preview-empty';
            empty.textContent = 'Nenhuma tag selecionada ainda';
            preview.appendChild(empty);
        } else {
            const fragment = document.createDocumentFragment();
            this.#selected.forEach(tag => {
                const pill = document.createElement('span');
                pill.className = 'preview-tag';
                pill.setAttribute('role', 'listitem');
                // SECURITY: textContent
                pill.textContent = sanitizeText(tag);
                fragment.appendChild(pill);
            });
            preview.appendChild(fragment);
        }

        if (countEl) countEl.textContent = String(this.#selected.size);
    }
}
