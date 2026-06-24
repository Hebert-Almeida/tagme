import { sanitizeText } from './security.js';

// ── Reduced-motion gate ──────────────────────────────────────────────────
// Live-tracked so OS-level toggle takes effect without a page reload.
const _rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let REDUCED_MOTION = _rmQuery.matches;
_rmQuery.addEventListener?.('change', e => { REDUCED_MOTION = e.matches; });

export function reducedMotion() { return REDUCED_MOTION; }

// Jump straight to a tween's end state (strips timing vars), firing onComplete.
// Shared by the safe* helpers below for the reduced-motion path.
function _applyEndState(targets, toVars) {
    const { duration, delay, stagger, ease, onComplete, ...endVars } = toVars;
    gsap.set(targets, endVars);
    onComplete?.();
    return null;
}

// Drop-in for gsap.fromTo / gsap.to that jumps to the end state when
// reduced-motion is on. Returns the tween (or null when skipped); honors
// onComplete in both paths.
export function safeFromTo(targets, fromVars, toVars) {
    return REDUCED_MOTION ? _applyEndState(targets, toVars) : gsap.fromTo(targets, fromVars, toVars);
}

export function safeTo(targets, toVars) {
    return REDUCED_MOTION ? _applyEndState(targets, toVars) : gsap.to(targets, toVars);
}

// ── Custom Cursor ────────────────────────────────────────────────────────
// Driven by gsap.quickTo on transform (GPU-composited) instead of writing
// inline left/top per mousemove (which would trigger layout reflow).
// Hover-expansion uses event delegation on the whole document.
const INTERACTIVE_SELECTOR =
    'a, button, .article-card, .tag-chip, .source-btn, .pagination-nav button, .dot, .s-cta, .dev-social';

export function initCursor() {
    const cursor = document.getElementById('cursor');
    if (!cursor) return;

    // Disable on coarse pointer (touch) or when motion is reduced.
    if (!window.matchMedia('(pointer: fine)').matches || REDUCED_MOTION) {
        cursor.style.display = 'none';
        return;
    }

    // xPercent/yPercent center the cursor regardless of its current size,
    // so expansion (10px → 32px) stays centered without recomputing offsets.
    gsap.set(cursor, { xPercent: -50, yPercent: -50 });

    const xTo = gsap.quickTo(cursor, 'x', { duration: 0.15, ease: 'power3' });
    const yTo = gsap.quickTo(cursor, 'y', { duration: 0.15, ease: 'power3' });

    document.addEventListener('mousemove', e => {
        xTo(e.clientX);
        yTo(e.clientY);
    }, { passive: true });

    document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; });

    // Delegated hover-expansion. relatedTarget guards prevent flicker when
    // the pointer moves between nested interactive elements (e.g. svg inside button).
    document.addEventListener('mouseover', e => {
        const into = e.target.closest?.(INTERACTIVE_SELECTOR);
        if (!into) return;
        const from = e.relatedTarget?.closest?.(INTERACTIVE_SELECTOR);
        if (into !== from) cursor.classList.add('expanded');
    });
    document.addEventListener('mouseout', e => {
        const out = e.target.closest?.(INTERACTIVE_SELECTOR);
        if (!out) return;
        const to = e.relatedTarget?.closest?.(INTERACTIVE_SELECTOR);
        if (out !== to) cursor.classList.remove('expanded');
    });
}

// ── Skeleton Screens ─────────────────────────────────────────────────────
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

// ── Toast Notifications ──────────────────────────────────────────────────
// Cap at 3 visible to avoid flooding on cascading failures.
const MAX_TOASTS = 3;
const TOAST_DEDUPE_MS = 1500;
const _recentToasts = new Map(); // message → timestamp

export function showToast(message, type = 'info', duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Dedupe identical messages within 1.5 s
    const key = `${type}:${message}`;
    const now = Date.now();
    const last = _recentToasts.get(key);
    if (last && now - last < TOAST_DEDUPE_MS) return;
    // Sweep expired keys so the map stays bounded to the active dedupe window
    // (messages can embed variable data, so keys would otherwise accumulate).
    for (const [k, ts] of _recentToasts) {
        if (now - ts >= TOAST_DEDUPE_MS) _recentToasts.delete(k);
    }
    _recentToasts.set(key, now);

    // Drop oldest toast(s) when over cap
    while (container.children.length >= MAX_TOASTS) {
        container.firstElementChild?.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

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

    safeFromTo(toast,
        { x: 40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }
    );

    setTimeout(() => {
        safeTo(toast, {
            x: 40, opacity: 0, duration: 0.28, ease: 'power2.in',
            onComplete: () => toast.remove()
        });
    }, duration);
}

// ── Inline Error Helpers ─────────────────────────────────────────────────
export function showInlineError(el, message) {
    el.textContent = sanitizeText(message);
    el.hidden = false;
    safeFromTo(el, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.22 });
}

export function hideInlineError(el) {
    el.hidden = true;
    el.textContent = '';
}

// ── Button Loading State ─────────────────────────────────────────────────
// Preserves child elements (icons, structured spans) by snapshotting innerHTML.
const _btnSnapshots = new WeakMap();

export function setLoading(btn, isLoading, loadingText = 'Aguarde…') {
    if (isLoading) {
        if (!_btnSnapshots.has(btn)) _btnSnapshots.set(btn, btn.innerHTML);
        btn.textContent = loadingText;
        btn.disabled = true;
        btn.classList.add('loading');
        btn.setAttribute('aria-busy', 'true');
    } else {
        const snapshot = _btnSnapshots.get(btn);
        if (snapshot != null) {
            btn.innerHTML = snapshot;
            _btnSnapshots.delete(btn);
        }
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.removeAttribute('aria-busy');
    }
}

// ── View Transitions ─────────────────────────────────────────────────────
// Slides outEl away and brings inEl in. Kills any in-flight tweens on both
// elements first so rapid clicks don't pile up overlapping animations.
export function transitionViews(outEl, inEl, direction = 'forward') {
    if (outEl) gsap.killTweensOf(outEl);
    if (inEl)  gsap.killTweensOf(inEl);

    return new Promise(resolve => {
        const outX  = direction === 'forward' ? '-55%' : '55%';
        const inXFrom = direction === 'forward' ? '55%' : '-55%';

        if (!outEl) {
            inEl.hidden = false;
            _animateViewIn(inEl, resolve);
            return;
        }

        // safeTo/safeFromTo make this motion-agnostic: under reduced-motion
        // each tween jumps straight to its end state and still fires onComplete.
        safeTo(outEl, {
            x: outX, opacity: 0,
            duration: 0.38, ease: 'power3.in',
            onComplete() {
                outEl.hidden = true;
                gsap.set(outEl, { x: 0, opacity: 1 });
                inEl.hidden = false;
                safeFromTo(inEl,
                    { x: inXFrom, opacity: 0 },
                    { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out',
                      onComplete: resolve }
                );
                _animateViewIn(inEl);
            }
        });
    });
}

function _animateViewIn(viewEl, callback) {
    const targets = viewEl.querySelectorAll(
        '.s-tag, .s-title, .s-body, .connect-form, ' +
        '.library-toolbar, .article-detail, .source-panel, ' +
        '.theme-display, .tag-blocks, .summary-content, ' +
        '.tag-preview-panel'
    );

    if (targets.length) {
        safeFromTo(targets,
            { opacity: 0, y: 18 },
            { opacity: 1, y: 0, duration: 0.42, ease: 'power3.out',
              stagger: 0.055, onComplete: callback }
        );
    } else {
        callback?.();
    }
}

// ── Card Stagger Entrance ────────────────────────────────────────────────
// Animates cards only as they scroll into view. With 20+ cards in a paginated
// list, this avoids running a single 1-second-long stagger that the user can't
// see anyway, and keeps the initial entrance snappy.
//
// Initial-state opacity:0 is set on every card up-front so they don't flash in
// before the observer fires. Reduced-motion users skip the observer entirely.
let _cardObserver = null;

export function animateCards(cards) {
    const list = Array.from(cards);
    if (list.length === 0) return;

    // Drop the previous render's observer so it doesn't keep watching detached
    // cards (and retaining its flush closure) after pagination/re-search.
    _cardObserver?.disconnect();
    _cardObserver = null;

    if (REDUCED_MOTION) {
        gsap.set(list, { opacity: 1, y: 0 });
        return;
    }

    gsap.set(list, { opacity: 0, y: 20 });

    if (!('IntersectionObserver' in window)) {
        // Fallback: stagger them all at once.
        gsap.to(list, {
            opacity: 1, y: 0, duration: 0.38, ease: 'power3.out', stagger: 0.045,
        });
        return;
    }

    // Batch staggers per "wave" of cards crossing the viewport, so the order
    // feels intentional instead of jittering one card per scroll tick.
    let pending = [];
    let flushScheduled = false;
    const flush = () => {
        flushScheduled = false;
        if (pending.length === 0) return;
        gsap.to(pending, {
            opacity: 1, y: 0, duration: 0.38, ease: 'power3.out', stagger: 0.045,
        });
        pending = [];
    };

    const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            pending.push(entry.target);
            io.unobserve(entry.target);
        }
        if (pending.length && !flushScheduled) {
            flushScheduled = true;
            requestAnimationFrame(flush);
        }
    }, { rootMargin: '50px 0px', threshold: 0.05 });

    _cardObserver = io;
    list.forEach(card => io.observe(card));
}

// ── Tag Chip Micro-interaction ────────────────────────────────────────────
// CSS-only — `.pulse` triggers @keyframes chip-pulse from animations.css,
// which is itself gated by @media (prefers-reduced-motion: reduce).
// The chip's :active scale (.94) handles click feedback in CSS.
export function pulseChip(chip) {
    chip.classList.add('pulse');
    chip.addEventListener('animationend', () => chip.classList.remove('pulse'), { once: true });
}

// ── Export Celebration ────────────────────────────────────────────────────
export function celebrateExport(container) {
    const icon  = container.querySelector('.export-success__icon');
    const title = container.querySelector('.export-success__title');
    const lines = container.querySelectorAll('.export-success__line');

    if (REDUCED_MOTION) {
        // Nothing to do — final state is the default rendered state.
        return;
    }

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

// ── Step Trail ────────────────────────────────────────────────────────────
// Rendered once at first call, subsequent calls only toggle classes/text.
const STEP_LABELS = ['Conectar', 'Biblioteca', 'Artigo', 'Tags', 'Resumo'];
let _stepTrailInited = false;

export function updateStepTrail(activeIndex) {
    const trail = document.getElementById('step-trail');
    if (!trail) return;

    if (!_stepTrailInited) {
        const fragment = document.createDocumentFragment();
        STEP_LABELS.forEach((label, i) => {
            const li = document.createElement('li');
            li.className = 'step-trail__item';
            li.dataset.step = String(i);

            const dot = document.createElement('span');
            dot.className = 'step-trail__dot';
            dot.setAttribute('aria-hidden', 'true');

            const lbl = document.createElement('span');
            lbl.className = 'step-trail__label';
            lbl.textContent = label;

            li.append(dot, lbl);
            fragment.appendChild(li);
        });
        trail.appendChild(fragment);
        _stepTrailInited = true;
    }

    const items = trail.querySelectorAll('.step-trail__item');
    items.forEach((li, i) => {
        const isActive = i === activeIndex;
        const isDone   = i < activeIndex;
        li.classList.toggle('on', isActive);
        li.classList.toggle('done', isDone);
        if (isActive) li.setAttribute('aria-current', 'step');
        else          li.removeAttribute('aria-current');

        const dot = li.firstElementChild;
        if (dot) dot.textContent = isDone ? '✓' : String(i + 1);
    });
}

// ── Debounce ─────────────────────────────────────────────────────────────
export function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

// ── Day / Night Theme Toggle ─────────────────────────────────────────────
const THEME_KEY = 'tagme-theme';

export function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
        document.documentElement.setAttribute('data-theme', stored);
    }
    // No stored value → CSS prefers-color-scheme handles it automatically.

    document.querySelectorAll('.btn-theme').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
        _syncThemeButtonState(btn);
    });
}

// Resolves the effective dark/light state: explicit data-theme wins, else
// falls back to the OS preference.
function _isDarkActive() {
    const current = document.documentElement.getAttribute('data-theme');
    if (current) return current === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function toggleTheme() {
    const next = _isDarkActive() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);

    document.querySelectorAll('.btn-theme').forEach(_syncThemeButtonState);
}

function _syncThemeButtonState(btn) {
    btn.setAttribute('aria-pressed', String(!_isDarkActive())); // pressed = light mode active
}
