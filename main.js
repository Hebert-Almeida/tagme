'use strict';

gsap.registerPlugin(ScrambleTextPlugin);

// ── DOM References ──────────────────────────────────────────────────────────
const pages  = Array.from(document.querySelectorAll('.page'));
const dotsEl = document.getElementById('dots');
const ctr    = document.getElementById('ctr');
const burger = document.getElementById('burger');
const mbg    = document.getElementById('mbg');
const mp     = document.getElementById('mpanel');
const mx     = document.getElementById('mx');
const total  = pages.length;

let cur = 0, busy = false;

// ── Custom Cursor ───────────────────────────────────────────────────────────
// Follows the mouse on devices with a fine pointer (mouse/trackpad).
// Interactive elements trigger an "expanded" state via hover events.
const cursorEl = document.getElementById('cursor');
if (cursorEl && window.matchMedia('(pointer: fine)').matches) {
    document.addEventListener('mousemove', e => {
        cursorEl.style.left = e.clientX + 'px';
        cursorEl.style.top  = e.clientY + 'px';
    }, { passive: true });

    document.querySelectorAll('a, button, .dot, .s-cta, .dev-social').forEach(el => {
        el.addEventListener('mouseenter', () => cursorEl.classList.add('expanded'));
        el.addEventListener('mouseleave', () => cursorEl.classList.remove('expanded'));
    });

    document.addEventListener('mouseleave', () => { cursorEl.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { cursorEl.style.opacity = '1'; });
} else if (cursorEl) {
    cursorEl.style.display = 'none';
}

// ── Theme Toggle (Day / Night) ──────────────────────────────────────────────
// Persists preference in localStorage. Falls back to system preference via
// CSS `prefers-color-scheme` media query when no stored value exists.
const THEME_KEY = 'tagme-landing-theme';

function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
        document.documentElement.setAttribute('data-theme', stored);
    }
}

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = current === 'dark' || (!current && systemDark);
    const next = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
}

initTheme();
document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

// ── Scramble Text (hero title) ──────────────────────────────────────────────
// GSAP ScrambleTextPlugin reveals the hero heading with a typewriter-like
// character scramble using "UFTM" as the shuffle alphabet.
const scrambleTarget = document.getElementById('scramble-target');
if (scrambleTarget) {
    gsap.to('#scramble-target', {
        delay: 0.4,
        duration: 1.2,
        scrambleText: {
            text: 'Otimize suas pesquisas com o Tag',
            chars: 'UFTM',
            revealDelay: 0.2,
            speed: 0.4
        }
    });
}

// ── Section Entrance Animations ─────────────────────────────────────────────
// Scoped per page so elements only animate when their section becomes active.
// Three tiers: simple elements, grid containers, and individual cards.
function animateIn(pageIndex) {
    const page = pages[pageIndex];

    // Tier 1 — headings, body text, buttons
    const simple = page.querySelectorAll(
        '.s-tag, .s-title, .s-body, .intro-btns, .s-cta:not(.how-cta), .s-media'
    );
    if (simple.length) {
        gsap.fromTo(simple,
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.07, delay: 0.05 }
        );
    }

    // Tier 2 — grid wrappers (slightly delayed)
    const grids = page.querySelectorAll(
        '.how-grid, .versions-grid, .devs-grid, .scroll-body'
    );
    if (grids.length) {
        gsap.fromTo(grids,
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', delay: 0.18 }
        );
    }

    // Tier 3 — individual cards with stagger
    const cards = page.querySelectorAll('.dev-card, .version-card, .how-col');
    if (cards.length) {
        gsap.fromTo(cards,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.09, delay: 0.22 }
        );
    }
}

// ── Navigation Dots ─────────────────────────────────────────────────────────
const dots = pages.map((_, i) => {
    const b = document.createElement('button');
    b.className  = 'dot' + (i === 0 ? ' on' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    b.setAttribute('aria-label', `Ir para seção ${i + 1}`);
    b.addEventListener('click', () => go(i));
    dotsEl.appendChild(b);
    return b;
});

// ── Initial Stack Layout ────────────────────────────────────────────────────
// Pages are stacked with a 3D perspective effect: the active page sits flat
// while subsequent pages recede with slight rotation, offset, and scale.
function initStack() {
    pages.forEach((p, i) => {
        if (i === 0) {
            gsap.set(p, { zIndex: total, rotateX: 0, y: 0, scale: 1, opacity: 1, transformOrigin: '50% 0%' });
        } else {
            gsap.set(p, {
                zIndex: total - i,
                rotateX: -2 * i,
                y: i * 10,
                scale: 1 - i * 0.015,
                opacity: i <= 2 ? 1 : 0,
                transformOrigin: '50% 0%'
            });
        }
    });
}
initStack();
animateIn(0);

// ── Active State ────────────────────────────────────────────────────────────
// Synchronizes dots, nav links, counter badge, and triggers section animation.
function setActive(i) {
    dots.forEach((d, j) => {
        d.classList.toggle('on', j === i);
        d.setAttribute('aria-selected', j === i ? 'true' : 'false');
    });

    document.querySelectorAll('[data-t]').forEach(a => {
        const active = parseInt(a.dataset.t) === i;
        a.classList.toggle('on', active);
        if (active) a.setAttribute('aria-current', 'page');
        else         a.removeAttribute('aria-current');
    });

    pages.forEach(p => {
        p.classList.remove('cur');
        p.style.willChange = 'auto';
    });
    pages[i].classList.add('cur');
    pages[i].style.willChange = 'transform, opacity';

    // Counter flash
    ctr.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    ctr.classList.add('flash');
    setTimeout(() => ctr.classList.remove('flash'), 600);

    animateIn(i);
}

// ── Restack ─────────────────────────────────────────────────────────────────
// After a transition completes, repositions all non-active pages into the
// background stack (pages ahead recede; pages behind are hidden).
function restack(active) {
    pages.forEach((p, i) => {
        const off = i - active;
        if (off === 0) return;
        gsap.set(p, {
            zIndex: off > 0 ? total - off : 0,
            rotateX: off > 0 ? -2 * off : 0,
            y: off > 0 ? off * 10 : 0,
            scale: off > 0 ? 1 - off * 0.015 : 0.97,
            opacity: off > 0 && off <= 2 ? 1 : 0
        });
    });
}

// ── Page Transition ─────────────────────────────────────────────────────────
// Animates between sections using a 3D card-stack metaphor.
// Forward: active page flips up and away; next page rises from the stack.
// Backward: previous page drops back in from above; current page recedes.
function go(next) {
    if (busy || next === cur || next < 0 || next >= total) return;
    busy = true;
    const dir      = next > cur ? 1 : -1;
    const leaving  = pages[cur];
    const arriving = pages[next];

    // Reset scroll position on sections with internal overflow
    const scrollSection = leaving.querySelector('.section--scroll');
    if (scrollSection) scrollSection.scrollTop = 0;

    if (dir === 1) {
        // Forward — leaving page flips up and shrinks out
        gsap.to(leaving, {
            rotateX: 25, y: '-105%', scale: 0.92, opacity: 0,
            duration: 0.6, ease: 'power3.in',
            onComplete() {
                gsap.set(leaving,  { zIndex: 0, opacity: 0 });
                gsap.set(arriving, { zIndex: total, rotateX: -6, y: 60, scale: 0.98, opacity: 1 });
                gsap.to(arriving,  { rotateX: 0, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' });
                restack(next);
                setActive(next);
                cur = next;
                setTimeout(() => { busy = false; }, 620);
            }
        });
    } else {
        // Backward — arriving page drops back from above; leaving recedes into the stack
        gsap.set(arriving, { zIndex: total + 1, rotateX: 25, y: '-105%', scale: 0.92, opacity: 1 });
        gsap.to(arriving, {
            rotateX: 0, y: 0, scale: 1, duration: 0.65, ease: 'power3.out'
        });
        gsap.to(leaving, {
            rotateX: -6, y: 60, scale: 0.98, opacity: 0,
            duration: 0.5, ease: 'power2.in',
            onComplete() {
                restack(next);
                setActive(next);
                cur = next;
                setTimeout(() => { busy = false; }, 620);
            }
        });
    }
}

// ── Scroll (wheel) ──────────────────────────────────────────────────────────
// Accumulates wheel deltas over a short window to distinguish intentional
// scrolls from trackpad inertia. Resets if direction changes mid-gesture.
let acc = 0, wheelTimer = null;
window.addEventListener('wheel', e => {
    e.preventDefault();
    if ((acc > 0 && e.deltaY < 0) || (acc < 0 && e.deltaY > 0)) acc = 0;
    acc += e.deltaY;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
        if (Math.abs(acc) > 20) go(acc > 0 ? cur + 1 : cur - 1);
        acc = 0;
    }, 60);
}, { passive: false });

// ── Touch Navigation ────────────────────────────────────────────────────────
let ty = 0;
const st = document.getElementById('stack');
st.addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
st.addEventListener('touchend', e => {
    const dy = ty - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 40) go(dy > 0 ? cur + 1 : cur - 1);
}, { passive: true });

// ── Keyboard Navigation ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowUp'   || e.key === 'PageUp')   { e.preventDefault(); go(cur - 1); }
    if (e.key === 'Escape' && mp.classList.contains('on')) closeMob();
});

// ── Nav Link Handlers ───────────────────────────────────────────────────────
document.querySelectorAll('[data-t]').forEach(a => {
    a.addEventListener('click', e => {
        e.preventDefault();
        go(parseInt(a.dataset.t, 10));
        closeMob();
    });
});

// ── CTA Button Routing ──────────────────────────────────────────────────────
// Routes "web" and "local" actions to their respective pages.
document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'web')        window.location.href = 'src/index.html';
        else if (action === 'local') window.location.href = 'installer.html';
    });
});

// ── Mobile Menu ─────────────────────────────────────────────────────────────
function openMob() {
    mbg.classList.add('on');
    mp.classList.add('on');
    mbg.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    const firstLink = mp.querySelector('a');
    if (firstLink) firstLink.focus();
}

function closeMob() {
    mbg.classList.remove('on');
    mp.classList.remove('on');
    mbg.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    burger.focus();
}

burger.addEventListener('click', openMob);
mx.addEventListener('click', closeMob);
mbg.addEventListener('click', closeMob);

// ── Lazy Media Loading ──────────────────────────────────────────────────────
// Uses IntersectionObserver to defer loading of images and videos inside
// `.s-media[data-lazy]` containers. Only loads from relative paths or HTTPS.
if ('IntersectionObserver' in window) {
    const lazyObs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const media = entry.target;
            const img   = media.querySelector('img[data-src]');
            const video = media.querySelector('video[data-src]');

            if (img) {
                const src = img.dataset.src || '';
                if (/^(https:\/\/|\/(?!\/))/.test(src) || !src.includes(':')) {
                    img.src = src;
                }
                img.removeAttribute('data-src');
            }
            if (video) {
                const src = video.dataset.src || '';
                if (/^(https:\/\/|\/(?!\/))/.test(src) || !src.includes(':')) {
                    video.src = src;
                    video.load();
                }
                video.removeAttribute('data-src');
            }
            lazyObs.unobserve(media);
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.s-media[data-lazy="1"]').forEach(m => lazyObs.observe(m));
}

// ── Reduced Motion ──────────────────────────────────────────────────────────
// Respects the user's OS-level preference for reduced motion by speeding up
// all GSAP timelines so animations effectively become instant.
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.globalTimeline.timeScale(20);
}
