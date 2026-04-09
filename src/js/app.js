'use strict';

// ── Imports ───────────────────────────────────────────────────────────────
import { ZoteroClient }       from './zotero.js';
import { fetchDOIMetadata }   from './doi.js';
import { renderPDFPages }     from './pdf.js';
import { generateAnalysis, generateAnalysisFromImages } from './ai.js';
import { validateApiKey, validateUserId, sanitizeText } from './security.js';
import {
    initCursor, bindCursorTargets, showToast, showInlineError, hideInlineError,
    setLoading, transitionViews, updateStepTrail, debounce, initTheme,
} from './ui.js';
import { ArticleList }   from '../components/articleList.js';
import { TagSelector }   from '../components/tagSelector.js';
import { SummaryPanel }  from '../components/summaryPanel.js';
import { ExportModal }   from '../components/exportModal.js';

// ── App state ─────────────────────────────────────────────────────────────
// Single source of truth. Never stored in localStorage.
const state = {
    view: 'connect',        // current view name
    client: null,           // ZoteroClient | null
    library: {
        items: [],
        total: 0,
        page: 0,
        perPage: 20,
        collections: [],
        searchTerm: '',
        collectionFilter: '',
        sort: 'dateAdded',
        direction: 'desc',
    },
    article: null,          // selected Zotero item | null
    doiMeta: null,          // CrossRef metadata | null
    extractedText: '',      // text to analyze (DOI or manual)
    pdfImages: null,        // string[] | null — rendered PDF page images for vision
    analysis: null,         // { tagBlocks, theme, summary } | null
    selectedTags: [],       // string[]
    includeSummary: true,
};

// ── View registry ─────────────────────────────────────────────────────────
const VIEWS = ['connect', 'library', 'article', 'tags', 'summary'];
const VIEW_INDEX = Object.fromEntries(VIEWS.map((v, i) => [v, i]));

// ── DOM references ────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = {
    // Views
    connect:  $('view-connect'),
    library:  $('view-library'),
    article:  $('view-article'),
    tags:     $('view-tags'),
    summary:  $('view-summary'),

    // Connect form
    formConnect:  $('form-connect'),
    inpApikey:    $('inp-apikey'),
    inpUserid:    $('inp-userid'),
    apikeyErr:    $('apikey-err'),
    useridErr:    $('userid-err'),
    connectErr:   $('connect-err'),
    btnConnect:   $('btn-connect'),

    // Library
    inpSearch:        $('inp-search'),
    selCollection:    $('sel-collection'),
    selSort:          $('sel-sort'),
    selDirection:     $('sel-direction'),
    btnToggleFilters: $('btn-toggle-filters'),
    filterPanelBody:  $('filter-panel-body'),
    libraryCount:     $('library-count'),
    articlesContainer: $('articles-container'),
    paginationNav:    $('pagination-nav'),

    // Article
    articleDetail:   $('article-detail'),
    btnDoi:          $('btn-doi'),
    btnManual:       $('btn-manual'),
    btnPdf:          $('btn-pdf'),
    inpPdf:          $('inp-pdf'),
    manualInputArea: $('manual-input-area'),
    inpArticleText:  $('inp-article-text'),
    charCount:       $('char-count'),
    textPreviewArea: $('text-preview-area'),
    previewLabel:    $('preview-label'),
    textPreviewContent: $('text-preview-content'),
    btnEditText:     $('btn-edit-text'),
    articleErr:      $('article-err'),
    btnAnalyze:      $('btn-analyze'),

    // Tags
    themeDisplay:       $('theme-display'),
    tagBlocks:          $('tag-blocks'),
    selectedTagsPreview: $('selected-tags-preview'),
    selectedCount:      $('selected-count'),
    tagsErr:            $('tags-err'),
    btnToSummary:       $('btn-to-summary'),

    // Summary
    summaryContent: $('summary-content'),
    summaryErr:     $('summary-err'),
    btnExport:      $('btn-export'),
    btnSkipSummary: $('btn-skip-summary'),

    // Global
    btnBack:    $('btn-back'),
    modalSlot:  $('modal-slot'),
    rateWarning: $('rate-warning'),
};

// ── Component instances ───────────────────────────────────────────────────
let articleList;
let tagSelector;
let summaryPanel;

// ── Navigation ────────────────────────────────────────────────────────────
function navigateTo(viewName, { fromPopstate = false } = {}) {
    const outName = state.view;
    if (outName === viewName) return;

    const outIdx = VIEW_INDEX[outName] ?? 0;
    const inIdx  = VIEW_INDEX[viewName] ?? 0;
    const dir    = inIdx > outIdx ? 'forward' : 'back';

    const outEl  = el[outName];
    const inEl   = el[viewName];

    state.view = viewName;
    updateStepTrail(inIdx);

    el.btnBack.hidden = inIdx === 0;

    // Push browser history so the back button navigates between views
    if (!fromPopstate) {
        history.pushState({ view: viewName }, '', null);
    }

    transitionViews(outEl, inEl, dir).then(() => {
        inEl.scrollTop = 0;
        bindCursorTargets();
    });
}

// ── Error display ─────────────────────────────────────────────────────────
function showRateWarning(visible) {
    el.rateWarning.hidden = !visible;
    if (visible) setTimeout(() => { el.rateWarning.hidden = true; }, 5000);
}

// ── STEP 1: CONNECT ───────────────────────────────────────────────────────
function setupConnectView() {
    el.formConnect.addEventListener('submit', handleConnect);
}

async function handleConnect(e) {
    e.preventDefault();

    const apiKey = sanitizeText(el.inpApikey.value);
    const userId = sanitizeText(el.inpUserid.value);

    hideInlineError(el.apikeyErr);
    hideInlineError(el.useridErr);
    hideInlineError(el.connectErr);

    let hasError = false;

    if (!apiKey) {
        showInlineError(el.apikeyErr, 'A chave de API é obrigatória.');
        el.inpApikey.setAttribute('aria-invalid', 'true');
        hasError = true;
    } else if (!validateApiKey(apiKey)) {
        showInlineError(el.apikeyErr, 'Chave de API inválida. Deve ter 16–64 caracteres alfanuméricos.');
        el.inpApikey.setAttribute('aria-invalid', 'true');
        hasError = true;
    } else {
        el.inpApikey.removeAttribute('aria-invalid');
    }

    if (!userId) {
        showInlineError(el.useridErr, 'O User ID é obrigatório.');
        el.inpUserid.setAttribute('aria-invalid', 'true');
        hasError = true;
    } else if (!validateUserId(userId)) {
        showInlineError(el.useridErr, 'User ID inválido. Deve ser numérico (ex: 1234567).');
        el.inpUserid.setAttribute('aria-invalid', 'true');
        hasError = true;
    } else {
        el.inpUserid.removeAttribute('aria-invalid');
    }

    if (hasError) return;

    setLoading(el.btnConnect, true, 'Conectando…');

    try {
        const client = new ZoteroClient(apiKey, userId);
        await client.verifyConnection();

        // Wipe credentials from any previous session before storing the new client
        state.client?.destroy();
        state.client = client;

        showToast('Biblioteca conectada com sucesso!', 'success');
        navigateTo('library');
        await loadLibrary();

    } catch (err) {
        if (err.message.includes('Limite')) showRateWarning(true);
        showInlineError(el.connectErr, err.message || 'Não foi possível conectar ao Zotero.');
    } finally {
        setLoading(el.btnConnect, false);
    }
}

// ── STEP 2: LIBRARY ───────────────────────────────────────────────────────
function setupLibraryView() {
    articleList = new ArticleList(
        el.articlesContainer,
        el.paginationNav,
        el.libraryCount,
        handleArticleEvent,
        state.library.perPage
    );

    el.inpSearch.addEventListener('input', debounce(handleSearch, 320));
    el.selCollection.addEventListener('change', handleSearch);
    el.selSort.addEventListener('change', handleSearch);
    el.selDirection.addEventListener('change', handleSearch);

    // Mobile: toggle filter panel visibility
    el.btnToggleFilters.addEventListener('click', () => {
        const open = el.filterPanelBody.classList.toggle('open');
        el.btnToggleFilters.setAttribute('aria-expanded', String(open));
    });
}

async function loadLibrary() {
    articleList.showLoading();

    try {
        const { sort, direction } = state.library;
        const [collectionsResult, itemsResult] = await Promise.allSettled([
            state.client.fetchCollections(),
            state.client.fetchItems(0, state.library.perPage, { sort, direction }),
        ]);

        if (collectionsResult.status === 'fulfilled') {
            state.library.collections = collectionsResult.value;
            _populateCollectionFilter(state.library.collections);
        }

        if (itemsResult.status === 'rejected') {
            throw itemsResult.reason;
        }

        const { items, total } = itemsResult.value;
        state.library.items = items;
        state.library.total = total;
        state.library.page  = 0;

        articleList.render(items, total, 0);

    } catch (err) {
        if (err.message.includes('Limite')) showRateWarning(true);
        articleList.showLoading(); // clear skeleton
        el.articlesContainer.innerHTML = '';
        const errEl = document.createElement('div');
        errEl.className = 'articles-empty';
        errEl.textContent = `Erro ao carregar biblioteca: ${sanitizeText(err.message)}`;
        el.articlesContainer.appendChild(errEl);
        showToast(err.message, 'error');
    }
}

let _searchController = null;

async function handleSearch() {
    const term       = sanitizeText(el.inpSearch.value);
    const collection = sanitizeText(el.selCollection.value);
    const sort       = el.selSort.value;
    const direction  = el.selDirection.value;

    state.library.searchTerm       = term;
    state.library.collectionFilter = collection;
    state.library.sort             = sort;
    state.library.direction        = direction;
    state.library.page = 0;

    _searchController?.abort();
    _searchController = new AbortController();
    const { signal } = _searchController;

    articleList.showLoading();

    try {
        const { items, total } = await state.client.searchItems(
            term, collection, 0, state.library.perPage, { signal, sort, direction }
        );
        state.library.items = items;
        state.library.total = total;
        articleList.render(items, total, 0);
    } catch (err) {
        if (err.name === 'AbortError') return;
        if (err.message.includes('Limite')) showRateWarning(true);
        showToast('Erro ao buscar artigos. Tente novamente.', 'error');
    }
}

function _populateCollectionFilter(collections) {
    // Remove old options (keep the default "all" option)
    while (el.selCollection.options.length > 1) {
        el.selCollection.remove(1);
    }

    collections.forEach(col => {
        const opt = document.createElement('option');
        opt.value = sanitizeText(col.key);
        opt.text = sanitizeText(col.data?.name ?? col.key);
        el.selCollection.appendChild(opt);
    });
}


// Handler called by ArticleList for both pagination and item selection
async function handleArticleEvent(payload) {
    // Pagination event
    if (payload?._paginate !== undefined) {
        await handlePageChange(payload._paginate);
        return;
    }
    // Article selection
    handleArticleSelect(payload);
}

async function handlePageChange(newPage) {
    state.library.page = newPage;
    articleList.showLoading();

    try {
        const start = newPage * state.library.perPage;
        const { searchTerm, collectionFilter, perPage, sort, direction } = state.library;
        const hasFilter = searchTerm || collectionFilter;

        const { items, total } = hasFilter
            ? await state.client.searchItems(searchTerm, collectionFilter, start, perPage, { sort, direction })
            : await state.client.fetchItems(start, perPage, { sort, direction });

        state.library.items = items;
        state.library.total = total;
        articleList.render(items, total, newPage);
    } catch (err) {
        if (err.message.includes('Limite')) showRateWarning(true);
        showToast(err.message, 'error');
    }
}

// ── STEP 3: ARTICLE SELECTION & ANALYSIS ─────────────────────────────────
function setupArticleView() {
    el.btnDoi.addEventListener('click', handleDOIFetch);
    el.btnManual.addEventListener('click', handleManualInput);
    el.btnPdf.addEventListener('click', () => el.inpPdf.click());
    el.inpPdf.addEventListener('change', handlePDFLoad);
    el.btnEditText.addEventListener('click', handleEditText);
    el.btnAnalyze.addEventListener('click', handleAnalyze);

    el.inpArticleText.addEventListener('input', () => {
        const len = el.inpArticleText.value.length;
        el.charCount.textContent = String(len);
        // Show analyze button once minimum length is met
        if (len >= 100) {
            el.btnAnalyze.hidden = false;
        }
    });
}

function handleArticleSelect(item) {
    state.article      = item;
    state.extractedText = '';
    state.pdfImages     = null;
    state.doiMeta       = null;

    el.textPreviewArea.hidden  = true;
    el.manualInputArea.hidden  = true;
    el.btnAnalyze.hidden       = true;
    el.inpArticleText.value    = '';
    el.inpPdf.value            = '';
    el.charCount.textContent   = '0';
    hideInlineError(el.articleErr);
    el.btnDoi.classList.remove('active');
    el.btnManual.classList.remove('active');
    el.btnPdf.classList.remove('active');

    _renderArticleDetail(item);

    const hasDoi = !!item.data?.DOI;
    el.btnDoi.disabled = !hasDoi;
    if (!hasDoi) {
        el.btnDoi.title = 'Este artigo não possui DOI registrado no Zotero.';
    } else {
        el.btnDoi.title = '';
    }

    navigateTo('article');
}

function _renderArticleDetail(item) {
    const data = item.data || {};
    el.articleDetail.innerHTML = '';

    const titleEl = document.createElement('p');
    titleEl.className = 'article-detail__title';
    titleEl.textContent = sanitizeText(data.title) || '(sem título)';
    el.articleDetail.appendChild(titleEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'article-detail__meta';

    const metas = [
        { label: 'Autores', value: _formatAuthors(data.creators) },
        { label: 'Ano', value: data.date ? new Date(String(data.date)).getFullYear() : null },
        { label: 'Periódico', value: data.publicationTitle },
        { label: 'DOI', value: data.DOI, cls: 'article-detail__doi' },
        { label: 'Volume', value: data.volume },
        { label: 'Número', value: data.issue },
        { label: 'Páginas', value: data.pages },
    ];

    metas.forEach(({ label, value, cls }) => {
        if (!value) return;
        const item = document.createElement('span');
        item.className = 'article-detail__meta-item' + (cls ? ` ${cls}` : '');

        const lbl = document.createElement('strong');
        lbl.textContent = `${label}: `;
        item.appendChild(lbl);

        const val = document.createTextNode(sanitizeText(String(value)));
        item.appendChild(val);
        metaEl.appendChild(item);
    });

    el.articleDetail.appendChild(metaEl);
}

function _formatAuthors(creators) {
    if (!Array.isArray(creators) || creators.length === 0) return null;
    const names = creators
        .slice(0, 4)
        .map(c => sanitizeText([c.firstName, c.lastName].filter(Boolean).join(' ')))
        .filter(Boolean);
    return names.join(', ') + (creators.length > 4 ? ' et al.' : '');
}

async function handleDOIFetch() {
    const doi = state.article?.data?.DOI;
    if (!doi) return;

    el.btnDoi.classList.add('active');
    el.btnManual.classList.remove('active');
    el.manualInputArea.hidden = true;
    el.textPreviewArea.hidden = true;
    el.btnAnalyze.hidden = true;
    hideInlineError(el.articleErr);

    setLoading(el.btnDoi, true, 'Buscando…');

    try {
        const meta = await fetchDOIMetadata(doi);

        if (!meta.abstract || meta.abstract.trim().length < 80) {
            throw new Error('Abstract não disponível ou muito curto via CrossRef. Insira o texto manualmente.');
        }

        state.extractedText = meta.abstract;
        state.doiMeta = meta;

        _showTextPreview(meta.abstract, 'Abstract via CrossRef:');
        showToast('Abstract obtido com sucesso!', 'success');

    } catch (err) {
        if (err.message.includes('Limite')) showRateWarning(true);
        showInlineError(el.articleErr, err.message);
        el.btnDoi.classList.remove('active');
    } finally {
        setLoading(el.btnDoi, false);
    }
}

async function handlePDFLoad() {
    const file = el.inpPdf.files?.[0];
    if (!file) return;

    el.btnPdf.classList.add('active');
    el.btnDoi.classList.remove('active');
    el.btnManual.classList.remove('active');
    el.manualInputArea.hidden = true;
    el.textPreviewArea.hidden = true;
    el.btnAnalyze.hidden = true;
    hideInlineError(el.articleErr);

    setLoading(el.btnPdf, true, 'Renderizando…');

    try {
        const images = await renderPDFPages(file);
        state.pdfImages    = images;
        state.extractedText = ''; // not used for vision flow

        _showPDFPreview(images[0], sanitizeText(file.name), images.length);
        showToast('PDF pronto — a IA vai ler as páginas diretamente!', 'success');
    } catch (err) {
        showInlineError(el.articleErr, err.message);
        el.btnPdf.classList.remove('active');
        el.inpPdf.value = '';
    } finally {
        setLoading(el.btnPdf, false);
    }
}

function _showPDFPreview(firstPageDataUrl, fileName, totalPages) {
    // Reuse the text-preview-area element but show an image + info instead
    el.previewLabel.textContent = 'PDF carregado:';

    el.textPreviewContent.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-preview-area';

    const img = document.createElement('img');
    img.src = firstPageDataUrl;
    img.alt = `Primeira página de ${fileName}`;
    img.className = 'pdf-preview-img';
    wrapper.appendChild(img);

    const info = document.createElement('p');
    info.className = 'pdf-preview-info';
    const nameStrong = document.createElement('strong');
    nameStrong.textContent = fileName;
    info.appendChild(nameStrong);
    info.appendChild(document.createTextNode(
        ` — ${totalPages} página${totalPages !== 1 ? 's' : ''} serão analisadas pela IA por visão.`
    ));
    wrapper.appendChild(info);

    el.textPreviewContent.appendChild(wrapper);
    el.textPreviewArea.hidden = false;
    el.btnAnalyze.hidden = false;

    gsap.fromTo([el.textPreviewArea, el.btnAnalyze],
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out', stagger: 0.06 }
    );
}

function handleManualInput() {
    el.btnManual.classList.add('active');
    el.btnDoi.classList.remove('active');
    el.textPreviewArea.hidden = true;
    el.manualInputArea.hidden = false;
    el.inpArticleText.focus();
    hideInlineError(el.articleErr);

    if (el.inpArticleText.value.length >= 100) {
        el.btnAnalyze.hidden = false;
    }
}

function handleEditText() {
    // Switching to manual text — discard any loaded PDF images
    state.pdfImages = null;
    el.btnPdf.classList.remove('active');

    el.textPreviewArea.hidden = true;
    el.manualInputArea.hidden = false;
    el.inpArticleText.value = state.extractedText;
    el.charCount.textContent = String(state.extractedText.length);
    el.btnAnalyze.hidden = state.extractedText.length < 100;
    el.inpArticleText.focus();
    el.btnManual.classList.add('active');
}

function _showTextPreview(text, label = 'Texto obtido:') {
    el.previewLabel.textContent = label;
    el.textPreviewContent.textContent = text.slice(0, 600) + (text.length > 600 ? '…' : '');
    el.textPreviewArea.hidden = false;
    el.btnAnalyze.hidden = false;

    gsap.fromTo([el.textPreviewArea, el.btnAnalyze],
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out', stagger: 0.06 }
    );
}

async function handleAnalyze() {
    hideInlineError(el.articleErr);
    setLoading(el.btnAnalyze, true, 'Analisando com IA…');

    try {
        let analysis;

        if (state.pdfImages?.length > 0) {
            // Vision flow: AI reads PDF pages directly as images
            const meta = _buildArticleMeta(state.article);
            analysis = await generateAnalysisFromImages(state.pdfImages, meta);
        } else {
            // Text flow: DOI abstract or manual paste
            const text = el.inpArticleText.value.trim() || state.extractedText;
            if (!text || text.length < 80) {
                setLoading(el.btnAnalyze, false);
                showInlineError(el.articleErr, 'Texto muito curto. Insira pelo menos 80 caracteres.');
                return;
            }
            state.extractedText = text;
            analysis = await generateAnalysis(text);
        }

        state.analysis = analysis;
        showToast('Análise concluída!', 'success');
        navigateTo('tags');
        _renderTagsView(analysis);
    } catch (err) {
        showInlineError(el.articleErr, err.message);
    } finally {
        setLoading(el.btnAnalyze, false);
    }
}

function _buildArticleMeta(item) {
    if (!item?.data) return '';
    const d = item.data;
    const parts = [];
    if (d.title) parts.push(`Title: ${sanitizeText(d.title)}`);
    if (d.creators?.length) parts.push(`Authors: ${_formatAuthors(d.creators)}`);
    if (d.date) parts.push(`Year: ${new Date(String(d.date)).getFullYear()}`);
    if (d.publicationTitle) parts.push(`Journal: ${sanitizeText(d.publicationTitle)}`);
    return parts.join('; ');
}

// ── STEP 4: TAG SELECTION ─────────────────────────────────────────────────
function setupTagsView() {
    tagSelector = new TagSelector(
        el.tagBlocks,
        el.selectedTagsPreview,
        el.selectedCount
    );
    el.btnToSummary.addEventListener('click', handleGoSummary);
}

function _renderTagsView(analysis) {
    el.themeDisplay.textContent = sanitizeText(analysis.theme);
    tagSelector.init(analysis.tagBlocks);

    hideInlineError(el.tagsErr);
}

function handleGoSummary() {
    const selected = tagSelector.getSelectedTags();

    if (selected.length === 0) {
        showInlineError(el.tagsErr, 'Selecione pelo menos uma tag antes de continuar.');
        return;
    }

    state.selectedTags = selected;
    hideInlineError(el.tagsErr);
    navigateTo('summary');
    _renderSummaryView();
}

// ── STEP 5: SUMMARY ───────────────────────────────────────────────────────
function setupSummaryView() {
    summaryPanel = new SummaryPanel(el.summaryContent);
    el.btnExport.addEventListener('click', () => handleExport(true));
    el.btnSkipSummary.addEventListener('click', () => handleExport(false));
}

function _renderSummaryView() {
    summaryPanel.showLoading();
    hideInlineError(el.summaryErr);

    setTimeout(() => {
        const summary = state.analysis?.summary;
        if (summary && summary.trim().length > 20) {
            summaryPanel.render(summary);
        } else {
            summaryPanel.renderEmpty('Não foi possível extrair frases representativas. Você ainda pode exportar as tags.');
        }
    }, 400);
}

async function handleExport(includeSummary) {
    state.includeSummary = includeSummary;

    const tags    = state.selectedTags;
    const summary = includeSummary ? summaryPanel.getValue() : null;
    const item    = state.article;

    if (!item || !state.client) {
        showInlineError(el.summaryErr, 'Sessão expirada. Volte ao início e conecte novamente.');
        return;
    }

    const modal = new ExportModal(
        el.modalSlot,
        async () => {
            await state.client.updateItemTagsAndSummary(
                item.key,
                tags,
                summary
            );
        },
        () => { /* user cancelled — no action needed */ }
    );

    modal.show(tags, summary);
}

// ── Back navigation ────────────────────────────────────────────────────────
function setupBackButton() {
    el.btnBack.addEventListener('click', handleBack);
}

function handleBack() {
    const idx = VIEW_INDEX[state.view] ?? 0;
    if (idx === 0) return;

    // Use browser history so popstate handles the actual navigation
    history.back();
}

// Browser back/forward button support
window.addEventListener('popstate', (e) => {
    const targetView = e.state?.view ?? 'connect';
    navigateTo(targetView, { fromPopstate: true });
});

// ── Session Cleanup ───────────────────────────────────────────────────────
// Wipe API credentials from memory when the user navigates away or closes the tab.
window.addEventListener('beforeunload', () => {
    state.client?.destroy();
});
window.addEventListener('pagehide', () => {
    state.client?.destroy();
});

// ── Init ──────────────────────────────────────────────────────────────────
function init() {
    // Register GSAP ScrambleText plugin (loaded globally)
    if (typeof gsap !== 'undefined' && typeof ScrambleTextPlugin !== 'undefined') {
        gsap.registerPlugin(ScrambleTextPlugin);
    }

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.globalTimeline.timeScale(20);
    }

    // Init day/night theme (reads localStorage or system preference)
    initTheme();

    // Init custom cursor
    initCursor();

    // Set initial step trail
    updateStepTrail(0);
    el.btnBack.hidden = true;

    // Seed browser history with the initial view
    history.replaceState({ view: 'connect' }, '', null);

    // Animate initial view in
    const firstTargets = el.connect.querySelectorAll('.s-tag, .s-title, .s-body, .connect-form');
    gsap.fromTo(Array.from(firstTargets),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.07, delay: 0.1 }
    );

    // Setup all views
    setupConnectView();
    setupLibraryView();
    setupArticleView();
    setupTagsView();
    setupSummaryView();
    setupBackButton();
}

// Run after DOM is ready (module scripts are deferred)
init();
