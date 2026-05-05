# TagMe

Automatically generate tags and summaries for academic articles and export them directly to your Zotero library.

> 🇧🇷 Versão em português: [README.pt-BR.md](README.pt-BR.md)

## What it does

TagMe connects to your Zotero library, analyzes the text or rendered pages of a selected article (via DOI abstract, manual paste, PDF upload, or DOI → open-access PDF lookup), and uses AI to produce:

- **Categorized tags** grouped by concept, methodology, research domain, and study type
- **A plain-language summary** ready to be saved in Zotero's Extra field

## Versions

| Version | Description |
|---------|-------------|
| **Web** | Browser-based, no installation required. Accessed via `src/index.html`. Requires a Zotero API key and a free Puter account for AI features. |
| **Landing page** | Marketing/info page at `index.html`. Links to the web app and to the upcoming Desktop version. |
| **Desktop** _(coming soon)_ | Installable native build with offline use, local metadata cache, and tighter Zotero integration. Not yet released. |

## Getting started (Web version)

1. Open `src/index.html` in a modern browser (Chrome, Firefox, Edge).
2. Get your **Zotero API key** from [zotero.org/settings/keys/new](https://www.zotero.org/settings/keys/new) — enable Read/Write on your library.
3. Get your **User ID** from [zotero.org/settings/keys](https://www.zotero.org/settings/keys) — it appears above the key list.
4. Paste both into the connect form and click **Conectar biblioteca**.
5. Select an article, choose a text source (DOI, paste, PDF, or DOI → PDF), and click **Analisar e gerar tags**.
6. Review and select tags, optionally edit the summary, then **Exportar para Zotero**.

## Text sources

- **Abstract via DOI** — fetches the abstract automatically from CrossRef (requires a registered DOI on the item).
- **Inserir texto** — paste any excerpt manually (minimum 100 characters).
- **Carregar PDF** — drop a PDF onto the article view or pick a file. The first 4 pages are rendered to images locally and sent to the vision model. Max 50 MB. No file is uploaded to any third-party server.
- **DOI → PDF** — looks up an open-access PDF for a DOI via OpenAlex. CORS-friendly hosts (currently `arxiv.org` / `export.arxiv.org`) are fetched directly; otherwise the landing page opens in a new tab so you can drag the PDF back in.

## Security model

- Zotero API credentials are kept **in memory only** — never written to localStorage, cookies, or any persistent store. They are wiped on tab close.
- All user-supplied strings are sanitized before display or use in API requests.
- AI analysis input is capped at 4 000 characters before leaving the browser.
- A strict Content Security Policy restricts script origins, disallows inline scripts, and limits `connect-src` to the exact API hosts the app uses.
- CrossRef, OpenAlex, and Zotero API responses are size-capped at 512 KB and parsed with `JSON.parse` only.
- All outbound URLs (`fetch`, `window.open`, anchor `href`) are validated as `https:` before use.
- PDF uploads are validated by extension, MIME type, size, and `%PDF-` magic bytes; rendering happens entirely client-side via PDF.js.
- Client-side rate limiters prevent accidental API abuse.

## Project structure

```
index.html          Landing page
main.css            Landing page styles
main.js             Landing page scripts
src/
  index.html        Web app entry point
  css/
    main.css        App styles
    animations.css  Skeleton, chip pulse, celebration animations
  js/
    app.js          Main controller — wires views and state
    ai.js           AI analysis via Puter.js (gpt-4o-mini, text + vision)
    doi.js          CrossRef metadata + OpenAlex open-access PDF lookup
    pdf.js          Client-side PDF rendering to JPEG (PDF.js)
    zotero.js       Zotero Web API client
    security.js     Sanitization, URL validation, rate limiter, schema validation
    ui.js           GSAP animations, toasts, transitions
  components/
    articleList.js  Paginated article card list
    tagSelector.js  Tag block + chip selection UI
    summaryPanel.js Editable summary textarea
    exportModal.js  Confirmation modal before writing to Zotero
```

## Dependencies (CDN, no build step)

| Library | Purpose |
|---------|---------|
| [GSAP 3](https://gsap.com/) | Animations and transitions |
| [DOMPurify](https://github.com/cure53/DOMPurify) | HTML sanitization |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Client-side PDF rendering |
| [Puter.js](https://puter.com/) | Free AI inference (no API key needed for users) |
| [CrossRef](https://www.crossref.org/) & [OpenAlex](https://openalex.org/) | DOI metadata and open-access PDF lookup |
| Plus Jakarta Sans | UI font via Google Fonts |

## Development

No build tooling required. Open `index.html` or `src/index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# or
python -m http.server
```


## Repository Registration

[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.20030972-1D79B7?style=flat&labelColor=555555)](https://doi.org/10.5281/zenodo.20030972)
