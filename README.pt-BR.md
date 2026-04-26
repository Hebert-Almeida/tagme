# TagMe

Gere automaticamente tags e resumos para artigos acadêmicos e exporte direto para sua biblioteca Zotero.

> 🇺🇸 English version: [README.md](README.md)

## O que faz

O TagMe se conecta à sua biblioteca do Zotero, analisa o texto ou as páginas renderizadas de um artigo selecionado (via abstract por DOI, colagem manual, upload de PDF ou busca DOI → PDF de acesso aberto) e usa IA para produzir:

- **Tags categorizadas** agrupadas por conceito, metodologia, domínio de pesquisa e tipo de estudo
- **Um resumo em linguagem clara** pronto para ser salvo no campo Extra do Zotero

## Versões

| Versão | Descrição |
|--------|-----------|
| **Web** | Roda no navegador, sem instalação. Acesse via `src/index.html`. Requer uma chave de API do Zotero e uma conta gratuita Puter para os recursos de IA. |
| **Landing page** | Página institucional em `index.html`. Direciona para a versão web e para a futura versão Desktop. |
| **Desktop** _(Em breve)_ | Build nativo instalável com uso offline, cache local de metadados e integração mais completa com o Zotero. Ainda não lançada. |

## Como começar (versão Web)

1. Abra `src/index.html` em um navegador moderno (Chrome, Firefox, Edge).
2. Pegue sua **chave de API do Zotero** em [zotero.org/settings/keys/new](https://www.zotero.org/settings/keys/new) — habilite leitura/escrita na biblioteca.
3. Pegue seu **User ID** em [zotero.org/settings/keys](https://www.zotero.org/settings/keys) — aparece acima da lista de chaves.
4. Cole os dois no formulário de conexão e clique em **Conectar biblioteca**.
5. Selecione um artigo, escolha uma fonte de texto (DOI, colar texto, PDF ou DOI → PDF) e clique em **Analisar e gerar tags**.
6. Revise e selecione as tags, edite o resumo se quiser, e então **Exportar para Zotero**.

## Fontes de texto

- **Abstract via DOI** — busca o abstract automaticamente no CrossRef (requer um DOI registrado no item).
- **Inserir texto** — cole qualquer trecho manualmente (mínimo 100 caracteres).
- **Carregar PDF** — arraste um PDF para a área do artigo ou selecione um arquivo. As 4 primeiras páginas são renderizadas como imagens localmente e enviadas ao modelo de visão. Máximo 50 MB. Nenhum arquivo é enviado para servidores de terceiros.
- **DOI → PDF** — busca um PDF de acesso aberto para o DOI via OpenAlex. Hosts compatíveis com CORS (atualmente `arxiv.org` / `export.arxiv.org`) são baixados direto; caso contrário, a página de destino é aberta em nova aba para você arrastar o PDF de volta.

## Modelo de segurança

- As credenciais da API do Zotero ficam **apenas em memória** — nunca gravadas em localStorage, cookies ou qualquer armazenamento persistente. São apagadas ao fechar a aba.
- Todas as strings vindas do usuário são sanitizadas antes de exibição ou uso em requisições à API.
- A entrada para análise da IA é limitada a 4 000 caracteres antes de sair do navegador.
- Uma Content Security Policy estrita restringe as origens de scripts, proíbe scripts inline e limita o `connect-src` exatamente aos hosts de API utilizados.
- Respostas das APIs CrossRef, OpenAlex e Zotero têm limite de 512 KB e são interpretadas apenas com `JSON.parse`.
- Toda URL externa (`fetch`, `window.open`, `href` de âncora) é validada como `https:` antes de uso.
- Uploads de PDF são validados por extensão, tipo MIME, tamanho e magic bytes (`%PDF-`); a renderização acontece inteiramente no cliente via PDF.js.
- Limitadores de taxa no cliente evitam abuso acidental das APIs.

## Estrutura do projeto

```
index.html          Landing page
main.css            Estilos da landing page
main.js             Scripts da landing page
src/
  index.html        Entrada do app web
  css/
    main.css        Estilos do app
    animations.css  Skeleton, pulso de chip, animações de comemoração
  js/
    app.js          Controlador principal — conecta views e estado
    ai.js           Análise via Puter.js (gpt-4o-mini, texto + visão)
    doi.js          Metadados do CrossRef + busca de PDF aberto no OpenAlex
    pdf.js          Renderização de PDF para JPEG no cliente (PDF.js)
    zotero.js       Cliente da Web API do Zotero
    security.js     Sanitização, validação de URL, rate limiter, validação de schema
    ui.js           Animações GSAP, toasts, transições
  components/
    articleList.js  Lista paginada de cards de artigo
    tagSelector.js  UI de blocos de tags + seleção de chips
    summaryPanel.js Textarea editável do resumo
    exportModal.js  Modal de confirmação antes de gravar no Zotero
```

## Dependências (CDN, sem build)

| Biblioteca | Função |
|------------|--------|
| [GSAP 3](https://gsap.com/) | Animações e transições |
| [DOMPurify](https://github.com/cure53/DOMPurify) | Sanitização de HTML |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Renderização de PDF no cliente |
| [Puter.js](https://puter.com/) | Inferência de IA gratuita (sem chave de API para o usuário) |
| [CrossRef](https://www.crossref.org/) e [OpenAlex](https://openalex.org/) | Metadados de DOI e busca de PDF de acesso aberto |
| Plus Jakarta Sans | Fonte da UI via Google Fonts |

## Desenvolvimento

Não precisa de ferramentas de build. Abra `index.html` ou `src/index.html` direto no navegador, ou sirva com qualquer servidor estático:

```bash
npx serve .
# ou
python -m http.server
```
