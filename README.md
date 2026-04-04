# TagMe

Automatically generate tags and summaries for academic articles and export them directly to your Zotero library.

## What it does

TagMe connects to your Zotero library, analyzes the text of a selected article (via DOI abstract, manual paste, or PDF upload), and uses AI to produce:

- **Categorized tags** grouped by concept, methodology, research domain, and study type
- **A plain-language summary** ready to be saved in Zotero's Extra field

## Versions

| Version | Description |
|---------|-------------|
| **Web** | Browser-based, no installation required. Accessed via `src/index.html`. Requires a Zotero API key and a free Puter account for AI features. |
| **Landing page** | Marketing/info page at `index.html`. Links to the web app and a future installable version. |

## Getting started (Web version)

1. Open `src/index.html` in a modern browser (Chrome, Firefox, Edge).
2. Get your **Zotero API key** from [zotero.org/settings/keys/new](https://www.zotero.org/settings/keys/new) — enable Read/Write on your library.
3. Get your **User ID** from [zotero.org/settings/keys](https://www.zotero.org/settings/keys) — it appears above the key list.
4. Paste both into the connect form and click **Conectar biblioteca**.
5. Select an article, choose a text source (DOI, paste, or PDF), and click **Analisar e gerar tags**.
6. Review and select tags, optionally edit the summary, then **Exportar para Zotero**.

## Text sources

- **Abstract via DOI** — fetches the abstract automatically from CrossRef (requires a registered DOI on the item).
- **Inserir texto** — paste any excerpt manually (minimum 100 characters).
- **Carregar PDF** — extract text client-side from a PDF file (max 50 MB, 30 pages). No file is uploaded to any server.

## Security model

- Zotero API credentials are kept **in memory only** — never written to localStorage, cookies, or any persistent store. They are wiped on tab close.
- All user-supplied strings are sanitized before display or use in API requests.
- AI analysis input is capped at 4 000 characters before leaving the browser.
- A strict Content Security Policy restricts script origins and disallows inline scripts.
- CrossRef and Zotero API responses are size-capped at 512 KB.
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
    ai.js           AI analysis via Puter.js (gpt-4o-mini)
    doi.js          CrossRef abstract fetching
    pdf.js          Client-side PDF text extraction (PDF.js)
    zotero.js       Zotero Web API client
    security.js     Sanitization, rate limiter, schema validation
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
| [PDF.js](https://mozilla.github.io/pdf.js/) | Client-side PDF text extraction |
| [Puter.js](https://puter.com/) | Free AI inference (no API key needed for users) |
| Plus Jakarta Sans | UI font via Google Fonts |

## Development

No build tooling required. Open `index.html` or `src/index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# or
python -m http.server
```
