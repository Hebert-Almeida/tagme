'use strict';

import { sanitizeText } from './security.js';

// NOTE: gsap and DOMPurify are loaded as global scripts in index.html
// and are accessible here as window.gsap etc.

// ── Cursor ───────────────────────────────────────────────────────────────
export function initCursor() {
    const cursor = document.getElementById('cursor');
    if (!cursor) return;

    // Only activate for real pointer devices (not touch-only)
    if (!window.matchMedia('(pointer: fine)').matches) {
        cursor.style.display = 'none';
        return;
    }

    document.addEventListener('mousemove', e => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top  = e.clientY + 'px';
    }, { passive: true });

    document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; });

    // Re-bindable: call this after new interactive elements are added to the DOM
    bindCursorTargets();
}

export function bindCursorTargets() {
    const cursor = document.getElementById('cursor');
    if (!cursor) return;

    const interactives = document.querySelectorAll(
        'a, button, .article-card, .tag-chip, .source-btn, .pagination-nav button'
    );
    interactives.forEach(el => {
        // Guard: avoid double-binding
        if (el.dataset.cursorBound) return;
        el.dataset.cursorBound = '1';
        el.addEventListener('mouseenter', () => cursor.classList.add('expanded'));
        el.addEventListener('mouseleave', () => cursor.classList.remove('expanded'));
    });
}

// ── Skeleton screens ─────────────────────────────────────────────────────
// Renders placeholder UI elements while real content loads.
// type: 'article' | 'tag' | 'text'
export function showSkeleton(container, count = 5, type = 'article') {
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = `skeleton skeleton--${type}`;
        el.setAttribute('aria-hidden', 'true');

        if (type === 'article') {
            const t = document.createElement('div');
            t.className = 'skel-line skel-line--title';
            const m1 = document.createElement('div');
            m1.className = 'skel-line skel-line--meta';
            const m2 = document.createElement('div');
            m2.className = 'skel-line skel-line--meta';
            m2.style.width = '50%';
            el.append(t, m1, m2);
        } else if (type === 'tag') {
            const line = document.createElement('div');
            line.className = 'skel-line skel-line--tag';
            el.appendChild(line);
        } else if (type === 'text') {
            const widths = ['95%', '88%', '70%', '82%'];
            widths.forEach(w => {
                const line = document.createElement('div');
                line.className = 'skel-line';
                line.style.width = w;
                el.appendChild(line);
            });
        }

        fragment.appendChild(el);
    }

    container.appendChild(fragment);
}

// ── Toast notifications ──────────────────────────────────────────────────
// type: 'info' | 'success' | 'error' | 'warning'
export function showToast(message, type = 'info', duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'status');

    const iconMap = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const iconEl = document.createElement('span');
    iconEl.className = 'toast__icon';
    iconEl.textContent = iconMap[type] || 'ℹ';
    iconEl.setAttribute('aria-hidden', 'true');

    const msgEl = document.createElement('span');
    msgEl.className = 'toast__msg';
    msgEl.textContent = sanitizeText(message);

    toast.appendChild(iconEl);
    toast.appendChild(msgEl);
    container.appendChild(toast);

    gsap.fromTo(toast,
        { x: 40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }
    );

    setTimeout(() => {
        gsap.to(toast, {
            x: 40, opacity: 0, duration: 0.28, ease: 'power2.in',
            onComplete: () => toast.remove()
        });
    }, duration);
}

// ── Inline error helpers ─────────────────────────────────────────────────
export function showInlineError(el, message) {
    // SECURITY: textContent, never innerHTML
    el.textContent = sanitizeText(message);
    el.hidden = false;
    gsap.fromTo(el, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.22 });
}

export function hideInlineError(el) {
    el.hidden = true;
    el.textContent = '';
}

// ── Button loading state ─────────────────────────────────────────────────
export function setLoading(btn, isLoading, loadingText = 'Aguarde…') {
    if (isLoading) {
        btn.dataset.origText = btn.textContent;
        btn.textContent = loadingText;
        btn.disabled = true;
        btn.classList.add('loading');
        btn.setAttribute('aria-busy', 'true');
    } else {
        btn.textContent = btn.dataset.origText ?? btn.textContent;
        delete btn.dataset.origText;
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.removeAttribute('aria-busy');
    }
}

// ── View transitions ─────────────────────────────────────────────────────
// Slides outEl away, slides inEl in from the given direction.
// direction: 'forward' | 'back'
export function transitionViews(outEl, inEl, direction = 'forward') {
    return new Promise(resolve => {
        const outX  = direction === 'forward' ? '-55%' : '55%';
        const inXFrom = direction === 'forward' ? '55%' : '-55%';

        if (!outEl) {
            // First view — no outgoing element
            inEl.hidden = false;
            _animateViewIn(inEl, resolve);
            return;
        }

        gsap.to(outEl, {
            x: outX, opacity: 0,
            duration: 0.38, ease: 'power3.in',
            onComplete() {
                outEl.hidden = true;
                gsap.set(outEl, { x: 0, opacity: 1 });
                inEl.hidden = false;
                gsap.fromTo(inEl,
                    { x: inXFrom, opacity: 0 },
                    { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out',
                      onComplete: resolve }
                );
                _animateViewIn(inEl);
            }
        });
    });
}

// Stagger-animates child elements when a view enters the screen
function _animateViewIn(viewEl, callback) {
    const targets = viewEl.querySelectorAll(
        '.s-tag, .s-title, .s-body, .connect-form, ' +
        '.library-toolbar, .article-detail, .source-panel, ' +
        '.theme-display, .tag-blocks, .summary-content, ' +
        '.tag-preview-panel'
    );

    if (targets.length) {
        gsap.fromTo(targets,
            { opacity: 0, y: 18 },
            { opacity: 1, y: 0, duration: 0.42, ease: 'power3.out',
              stagger: 0.055, onComplete: callback }
        );
    } else {
        callback?.();
    }
}

// ── Card stagger entrance ────────────────────────────────────────────────
export function animateCards(cards) {
    gsap.fromTo(Array.from(cards),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.38, ease: 'power3.out', stagger: 0.045 }
    );
}

// ── Tag chip micro-interaction ────────────────────────────────────────────
export function pulseChip(chip) {
    gsap.timeline()
        .to(chip, { scale: 0.88, duration: 0.1, ease: 'power2.in' })
        .to(chip, { scale: 1, duration: 0.22, ease: 'back.out(2.5)' });
    chip.classList.add('pulse');
    chip.addEventListener('animationend', () => chip.classList.remove('pulse'), { once: true });
}

// ── Export celebration ────────────────────────────────────────────────────
export function celebrateExport(container) {
    const icon  = container.querySelector('.export-success__icon');
    const title = container.querySelector('.export-success__title');
    const lines = container.querySelectorAll('.export-success__line');

    const tl = gsap.timeline();
    if (icon) {
        tl.fromTo(icon,
            { scale: 0.4, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.8)' }
        );
    }
    if (title) {
        tl.fromTo(title,
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' },
            '-=0.15'
        );
    }
    if (lines.length) {
        tl.fromTo(lines,
            { opacity: 0, x: -8 },
            { opacity: 1, x: 0, stagger: 0.07, duration: 0.28, ease: 'power3.out' },
            '-=0.1'
        );
    }
}

// ── Step trail ────────────────────────────────────────────────────────────
const STEP_LABELS = ['Conectar', 'Biblioteca', 'Artigo', 'Tags', 'Resumo'];

export function updateStepTrail(activeIndex) {
    const trail = document.getElementById('step-trail');
    if (!trail) return;

    trail.innerHTML = '';
    const fragment = document.createDocumentFragment();

    STEP_LABELS.forEach((label, i) => {
        const li = document.createElement('li');
        li.className = 'step-trail__item' +
            (i === activeIndex ? ' on' : '') +
            (i < activeIndex ? ' done' : '');

        if (i === activeIndex) {
            li.setAttribute('aria-current', 'step');
        }

        const dot = document.createElement('span');
        dot.className = 'step-trail__dot';
        dot.setAttribute('aria-hidden', 'true');
        dot.textContent = i < activeIndex ? '✓' : String(i + 1);

        const lbl = document.createElement('span');
        lbl.className = 'step-trail__label';
        lbl.textContent = label;

        li.appendChild(dot);
        li.appendChild(lbl);
        fragment.appendChild(li);
    });

    trail.appendChild(fragment);
}

// ── Debounce utility ──────────────────────────────────────────────────────
export function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

// ── Day / Night theme toggle ──────────────────────────────────────────────
const THEME_KEY = 'tagme-theme';

export function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
        document.documentElement.setAttribute('data-theme', stored);
    }
    // If no stored preference, CSS media query handles it automatically.

    document.querySelectorAll('.btn-theme').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });
}

export function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    // Determine effective current theme (accounting for system preference)
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = current === 'dark' || (!current && systemDark);
    const next = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
}
