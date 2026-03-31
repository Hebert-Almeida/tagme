'use strict';

gsap.registerPlugin(ScrambleTextPlugin);

/* ── REFERÊNCIAS ── */
const pages   = Array.from(document.querySelectorAll('.page'));
const dotsEl  = document.getElementById('dots');
const ctr     = document.getElementById('ctr');
const burger  = document.getElementById('burger');
const mbg     = document.getElementById('mbg');
const mp      = document.getElementById('mpanel');
const mx      = document.getElementById('mx');
const total   = pages.length;
let cur = 0, busy = false;

/* ── CURSOR PERSONALIZADO ── */
const cursorEl = document.getElementById('cursor');
if (cursorEl && window.matchMedia('(pointer: fine)').matches) {
    /* só ativa em dispositivos com mouse real */
    let cx = -100, cy = -100;
    document.addEventListener('mousemove', e => {
        cx = e.clientX; cy = e.clientY;
        cursorEl.style.left = cx + 'px';
        cursorEl.style.top  = cy + 'px';
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

/* ── SCRAMBLE TEXT (hero only) ── */
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

/* ── ANIMAÇÃO DE ENTRADA POR SEÇÃO ──
   Escopo por página para não vazar entre seções.
   Anima .s-tag, .s-title, .s-body, .intro-btns,
   .how-grid, .versions-grid, .devs-grid, .scroll-body
   cada um com stagger diferente.
── */
function animateIn(pageIndex) {
    const page = pages[pageIndex];

    /* elementos simples — fade + slide */
    const simple = page.querySelectorAll(
        '.s-tag, .s-title, .s-body, .intro-btns, .s-cta:not(.how-cta), .s-media'
    );
    if (simple.length) {
        gsap.fromTo(simple,
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.07, delay: 0.05 }
        );
    }

    /* grids e blocos maiores — ligeiramente mais lentos */
    const grids = page.querySelectorAll(
        '.how-grid, .versions-grid, .devs-grid, .scroll-body'
    );
    if (grids.length) {
        gsap.fromTo(grids,
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', delay: 0.18 }
        );
    }

    /* cards individuais com stagger */
    const cards = page.querySelectorAll('.dev-card, .version-card, .how-col');
    if (cards.length) {
        gsap.fromTo(cards,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.09, delay: 0.22 }
        );
    }
}

/* ── DOTS ── */
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

/* ── STACK INICIAL ── */
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

/* ── SET ACTIVE ── */
function setActive(i) {
    /* dots */
    dots.forEach((d, j) => {
        d.classList.toggle('on', j === i);
        d.setAttribute('aria-selected', j === i ? 'true' : 'false');
    });

    /* nav links */
    document.querySelectorAll('[data-t]').forEach(a => {
        const active = parseInt(a.dataset.t) === i;
        a.classList.toggle('on', active);
        if (active) a.setAttribute('aria-current', 'page');
        else         a.removeAttribute('aria-current');
    });

    /* will-change só na ativa */
    pages.forEach((p, j) => {
        p.classList.remove('cur');
        p.style.willChange = 'auto';
    });
    pages[i].classList.add('cur');
    pages[i].style.willChange = 'transform, opacity';

    /* counter com flash */
    ctr.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    ctr.classList.add('flash');
    setTimeout(() => ctr.classList.remove('flash'), 600);

    /* anima elementos da nova seção */
    animateIn(i);
}

/* ── RESTACK ── */
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

/* ── TRANSIÇÃO ── */
function go(next) {
    if (busy || next === cur || next < 0 || next >= total) return;
    busy = true;
    const dir     = next > cur ? 1 : -1;
    const leaving  = pages[cur];
    const arriving = pages[next];

    /* reseta scroll das seções com overflow */
    const leavingSection = leaving.querySelector('.section--scroll');
    if (leavingSection) leavingSection.scrollTop = 0;

    if (dir === 1) {
        gsap.to(leaving, {
            rotateX: 25, y: '-105%', scale: 0.92, opacity: 0,
            duration: 0.6, ease: 'power3.in',
            onComplete() {
                gsap.set(leaving,  { zIndex: 0, opacity: 0 });
                gsap.set(arriving, { zIndex: total, rotateX: -6, y: 60, scale: 0.98, opacity: 1 });
                gsap.to(arriving,  { rotateX: 0, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' });
                restack(next); setActive(next); cur = next;
                setTimeout(() => { busy = false; }, 620);
            }
        });
    } else {
        gsap.set(arriving, { zIndex: total + 1, rotateX: 15, y: '-60%', scale: 0.94, opacity: 1 });
        gsap.to(arriving,  { rotateX: 0, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' });
        gsap.to(leaving, {
            rotateX: -4, y: 40, scale: 0.97, opacity: 0.6,
            duration: 0.5, ease: 'power2.in',
            onComplete() {
                restack(next); setActive(next); cur = next;
                setTimeout(() => { busy = false; }, 620);
            }
        });
    }
}

/* ── SCROLL (wheel) ──
   #8: acc zerado após disparar E guard de direção
   para não acumular intenções opostas.
── */
let acc = 0, wheelTimer = null;
window.addEventListener('wheel', e => {
    e.preventDefault();
    /* se mudou de direção, zera acumulador antes de somar */
    if ((acc > 0 && e.deltaY < 0) || (acc < 0 && e.deltaY > 0)) acc = 0;
    acc += e.deltaY;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
        if (Math.abs(acc) > 20) go(acc > 0 ? cur + 1 : cur - 1);
        acc = 0;
    }, 60);
}, { passive: false });

/* ── TOUCH ── */
let ty = 0;
const st = document.getElementById('stack');
st.addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
st.addEventListener('touchend', e => {
    const dy = ty - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 40) go(dy > 0 ? cur + 1 : cur - 1);
}, { passive: true });

/* ── TECLADO ── */
document.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowUp'   || e.key === 'PageUp')   { e.preventDefault(); go(cur - 1); }
    if (e.key === 'Escape' && mp.classList.contains('on')) closeMob();
});

/* ── NAV LINKS ── */
document.querySelectorAll('[data-t]').forEach(a => {
    a.addEventListener('click', e => {
        e.preventDefault();
        go(parseInt(a.dataset.t, 10));
        closeMob();
    });
});

/* ── BOTÕES CTA (data-action em vez de IDs duplicados) ── */
document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        /* FIX: sanitiza o valor antes de usar — previne open redirect */
        if (action === 'web')   window.location.href = 'converter.html';
        else if (action === 'local') window.location.href = 'installer.html';
    });
});

/* ── MOBILE MENU ── */
function openMob() {
    mbg.classList.add('on');
    mp.classList.add('on');
    mbg.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    /* foca primeiro link para acessibilidade */
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

/* ── LAZY LOAD (IntersectionObserver) ──
   Ativa quando substituir .s-media por
   <img data-src="..." loading="lazy"> ou
   <video data-src="..." preload="none">
── */
if ('IntersectionObserver' in window) {
    const lazyObs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const media = entry.target;
            const img   = media.querySelector('img[data-src]');
            const video = media.querySelector('video[data-src]');
            if (img) {
                /* Sanitiza: aceita apenas paths relativos e https */
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

/* ── REDUCED MOTION ── */
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.globalTimeline.timeScale(20);
}
