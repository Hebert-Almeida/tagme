// ===== VARIÁVEIS GLOBAIS =====
let zoteroConfig = {
    apiKey: '',
    userId: '',
    connected: false
};

let library = {
    items: [],
    collections: [],
    filteredItems: [],
    currentPage: 1,
    itemsPerPage: 20
};

let selectedArticle = null;
let extractedText = '';
let generatedTags = new Set();

// Stopwords
const stopwords = new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'em', 'no', 'na', 'por', 'para', 'com',
    'que', 'se', 'como', 'é', 'são', 'foi', 'ser', 'the', 'is', 'at', 'of', 'in', 'to', 'for',
    'with', 'by', 'from', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'using', 'used', 'based'
]);

// ===== PASSO 1: CONECTAR AO ZOTERO =====

async function connectZotero() {
    const apiKey = document.getElementById('zoteroApiKey').value.trim();
    const userId = document.getElementById('zoteroUserId').value.trim();
    
    if (!apiKey || !userId) {
        showStatus('connectionStatus', 'Por favor, preencha API Key e User ID.', 'error');
        return;
    }
    
    showStatus('connectionStatus', 'Conectando ao Zotero...', 'loading');
    
    try {
        // Testar conexão buscando itens da biblioteca
        const response = await fetch(
            `https://api.zotero.org/users/${userId}/items?limit=1`,
            {
                headers: {
                    'Zotero-API-Key': apiKey,
                    'Zotero-API-Version': '3'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error('Credenciais inválidas ou sem permissão');
        }
        
        // Salvar configuração
        zoteroConfig = { apiKey, userId, connected: true };
        localStorage.setItem('zoteroApiKey', apiKey);
        localStorage.setItem('zoteroUserId', userId);
        
        showStatus('connectionStatus', '✅ Conectado com sucesso! Carregando biblioteca...', 'success');
        
        // Carregar biblioteca
        await loadLibrary();
        
    } catch (error) {
        showStatus('connectionStatus', '❌ Erro: ' + error.message, 'error');
    }
}

async function loadLibrary() {
    showLoading('Carregando sua biblioteca Zotero...');
    
    try {
        // Carregar coleções
        const collectionsResponse = await fetch(
            `https://api.zotero.org/users/${zoteroConfig.userId}/collections`,
            {
                headers: {
                    'Zotero-API-Key': zoteroConfig.apiKey,
                    'Zotero-API-Version': '3'
                }
            }
        );
        
        if (collectionsResponse.ok) {
            library.collections = await collectionsResponse.json();
        }
        
        // Carregar todos os itens (limitado a 100 para performance)
        const itemsResponse = await fetch(
            `https://api.zotero.org/users/${zoteroConfig.userId}/items?limit=100&itemType=journalArticle`,
            {
                headers: {
                    'Zotero-API-Key': zoteroConfig.apiKey,
                    'Zotero-API-Version': '3'
                }
            }
        );
        
        if (!itemsResponse.ok) {
            throw new Error('Erro ao carregar itens');
        }
        
        library.items = await itemsResponse.json();
        library.filteredItems = library.items;
        
        hideLoading();
        
        // Mostrar passo 2
        document.getElementById('step2').style.display = 'block';
        document.getElementById('libraryInfo').textContent = `${library.items.length} artigos encontrados`;
        
        // Popular filtro de coleções
        populateCollectionFilter();
        
        // Renderizar artigos
        renderArticles();
        
        // Scroll suave
        setTimeout(() => {
            document.getElementById('step2').scrollIntoView({ behavior: 'smooth' });
        }, 300);
        
    } catch (error) {
        hideLoading();
        showStatus('connectionStatus', '❌ Erro ao carregar biblioteca: ' + error.message, 'error');
    }
}

function populateCollectionFilter() {
    const select = document.getElementById('collectionFilter');
    select.innerHTML = '<option value="">Todas as coleções</option>';
    
    library.collections.forEach(collection => {
        const option = document.createElement('option');
        option.value = collection.key;
        option.textContent = collection.data.name;
        select.appendChild(option);
    });
}

// ===== PASSO 2: ESCOLHER ARTIGO =====

function filterArticles() {
    const searchTerm = document.getElementById('searchArticles').value.toLowerCase();
    const collectionKey = document.getElementById('collectionFilter').value;
    
    library.filteredItems = library.items.filter(item => {
        const data = item.data;
        const title = data.title?.toLowerCase() || '';
        const creators = data.creators?.map(c => `${c.firstName} ${c.lastName}`).join(' ').toLowerCase() || '';
        const year = data.date || '';
        
        const matchesSearch = title.includes(searchTerm) || creators.includes(searchTerm) || year.includes(searchTerm);
        const matchesCollection = !collectionKey || item.data.collections?.includes(collectionKey);
        
        return matchesSearch && matchesCollection;
    });
    
    library.currentPage = 1;
    renderArticles();
}

function filterByCollection() {
    filterArticles();
}

function renderArticles() {
    const container = document.getElementById('articlesList');
    container.innerHTML = '';
    
    if (library.filteredItems.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: #999;">Nenhum artigo encontrado</div>';
        return;
    }
    
    const start = (library.currentPage - 1) * library.itemsPerPage;
    const end = start + library.itemsPerPage;
    const pageItems = library.filteredItems.slice(start, end);
    
    pageItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'article-item';
        div.onclick = () => selectArticle(item);
        
        const data = item.data;
        const title = data.title || 'Sem título';
        const creators = data.creators?.slice(0, 3).map(c => `${c.firstName || ''} ${c.lastName || ''}`).join(', ') || 'Sem autor';
        const year = data.date ? new Date(data.date).getFullYear() : '';
        const journal = data.publicationTitle || '';
        
        div.innerHTML = `
            <div class="article-title">${title}</div>
            <div class="article-meta">
                ${creators}${data.creators && data.creators.length > 3 ? ' et al.' : ''}
                ${year ? ` • ${year}` : ''}
                ${journal ? ` • ${journal}` : ''}
            </div>
            ${data.tags && data.tags.length > 0 ? `
                <div class="article-tags">
                    ${data.tags.slice(0, 5).map(t => `<span class="article-tag">${t.tag}</span>`).join('')}
                </div>
            ` : ''}
        `;
        
        container.appendChild(div);
    });
    
    renderPagination();
}

function renderPagination() {
    const container = document.getElementById('pagination');
    const totalPages = Math.ceil(library.filteredItems.length / library.itemsPerPage);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = '';
    
    if (library.currentPage > 1) {
        const prev = document.createElement('button');
        prev.className = 'btn-secondary';
        prev.textContent = '← Anterior';
        prev.onclick = () => {
            library.currentPage--;
            renderArticles();
        };
        container.appendChild(prev);
    }
    
    const info = document.createElement('span');
    info.textContent = `Página ${library.currentPage} de ${totalPages}`;
    info.style.padding = '8px 15px';
    container.appendChild(info);
    
    if (library.currentPage < totalPages) {
        const next = document.createElement('button');
        next.className = 'btn-secondary';
        next.textContent = 'Próxima →';
        next.onclick = () => {
            library.currentPage++;
            renderArticles();
        };
        container.appendChild(next);
    }
}

function selectArticle(item) {
    selectedArticle = item;
    
    // Destacar item selecionado
    document.querySelectorAll('.article-item').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    
    // Mostrar passo 3
    document.getElementById('step3').style.display = 'block';
    
    // Mostrar informações do artigo selecionado
    const data = item.data;
    const creators = data.creators?.slice(0, 3).map(c => `${c.firstName || ''} ${c.lastName || ''}`).join(', ') || 'Sem autor';
    
    document.getElementById('selectedArticle').innerHTML = `
        <h4>📄 Artigo Selecionado</h4>
        <div class="meta">
            <strong>Título:</strong> ${data.title || 'Sem título'}<br>
            <strong>Autores:</strong> ${creators}${data.creators && data.creators.length > 3 ? ' et al.' : ''}<br>
            <strong>Ano:</strong> ${data.date ? new Date(data.date).getFullYear() : 'N/A'}<br>
            <strong>DOI:</strong> ${data.DOI || 'N/A'}<br>
            <strong>Anexos:</strong> ${item.links?.attachment?.attachmentType === 'application/pdf' ? '✅ PDF disponível' : '❌ Sem PDF'}
        </div>
    `;
    
    // Habilitar/desabilitar botões conforme disponibilidade
    document.getElementById('pdfBtn').disabled = !item.links?.attachment;
    document.getElementById('doiBtn').disabled = !data.DOI;
    
    // Scroll suave
    setTimeout(() => {
        document.getElementById('step3').scrollIntoView({ behavior: 'smooth' });
    }, 300);
}

// ===== PASSO 3: EXTRAIR E ANALISAR TEXTO =====

async function extractFromPDF() {
    if (!selectedArticle.links?.attachment) {
        showStatus('analysisStatus', 'Este artigo não possui PDF anexado.', 'error');
        return;
    }
    
    showLoading('Extraindo texto do PDF...');
    
    try {
        // Buscar PDF da API Zotero
        const attachmentKey = selectedArticle.links.attachment.href.split('/').pop();
        
        const response = await fetch(
            `https://api.zotero.org/users/${zoteroConfig.userId}/items/${attachmentKey}/file`,
            {
                headers: {
                    'Zotero-API-Key': zoteroConfig.apiKey
                }
            }
        );
        
        if (!response.ok) {
            throw new Error('Erro ao baixar PDF');
        }
        
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        
        // Usar PDF.js para extrair texto
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        // Extrair texto de todas as páginas (limite 20 para performance)
        const maxPages = Math.min(pdf.numPages, 20);
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        
        hideLoading();
        
        if (fullText.trim().length < 100) {
            showStatus('analysisStatus', 'PDF extraído mas o texto é muito curto. Tente outra fonte.', 'error');
            return;
        }
        
        extractedText = fullText.trim();
        showTextPreview();
        
    } catch (error) {
        hideLoading();
        showStatus('analysisStatus', '❌ Erro ao extrair PDF: ' + error.message + '. Tente inserir manualmente.', 'error');
    }
}

async function fetchFromDOI() {
    if (!selectedArticle.data.DOI) {
        showStatus('analysisStatus', 'Este artigo não possui DOI.', 'error');
        return;
    }
    
    showLoading('Buscando abstract via DOI...');
    
    try {
        const response = await fetch(
            `https://api.crossref.org/works/${encodeURIComponent(selectedArticle.data.DOI)}`
        );
        
        if (!response.ok) {
            throw new Error('DOI não encontrado');
        }
        
        const data = await response.json();
        const work = data.message;
        
        if (work.abstract) {
            // Limpar XML do abstract
            extractedText = work.abstract
                .replace(/<jats:title>.*?<\/jats:title>/gi, '')
                .replace(/<\/?jats:[^>]+>/gi, '')
                .replace(/<[^>]+>/g, '')
                .trim();
            
            hideLoading();
            showTextPreview();
        } else {
            hideLoading();
            showStatus('analysisStatus', 'Abstract não disponível via DOI. Tente outra fonte.', 'error');
        }
        
    } catch (error) {
        hideLoading();
        showStatus('analysisStatus', '❌ Erro ao buscar DOI: ' + error.message, 'error');
    }
}

function showManualInput() {
    document.getElementById('manualInput').style.display = 'block';
    document.getElementById('textPreview').style.display = 'none';
    document.getElementById('analyzeBtn').style.display = 'block';
}

function showTextPreview() {
    const preview = extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : '');
    document.getElementById('previewContent').textContent = preview;
    document.getElementById('textPreview').style.display = 'block';
    document.getElementById('manualInput').style.display = 'none';
    document.getElementById('analyzeBtn').style.display = 'block';
}

function editExtractedText() {
    document.getElementById('articleText').value = extractedText;
    showManualInput();
}

function analyzeText() {
    // Pegar texto (extraído ou manual)
    const manualText = document.getElementById('articleText').value.trim();
    const textToAnalyze = manualText || extractedText;
    
    if (!textToAnalyze || textToAnalyze.length < 100) {
        showStatus('analysisStatus', 'Texto muito curto. Mínimo 100 caracteres.', 'error');
        return;
    }
    
    showLoading('Analisando texto e gerando tags...');
    
    setTimeout(() => {
        try {
            // Análise NLP
            const tfidfTerms = advancedTFIDF(textToAnalyze);
            const phrases = extractNGrams(textToAnalyze);
            const entities = extractEntities(textToAnalyze);
            const mainTopic = detectMainTopic(textToAnalyze, tfidfTerms, phrases);
            
            // Gerar tags
            generatedTags.clear();
            
            // Top 8 termos TF-IDF
            tfidfTerms.slice(0, 8).forEach(item => generatedTags.add(item.term));
            
            // Top 5 frases
            phrases.slice(0, 5).forEach(item => generatedTags.add(item.phrase));
            
            // Tema principal
            if (mainTopic) generatedTags.add(mainTopic);
            
            // Tópicos do NER
            if (entities.topics) {
                entities.topics.slice(0, 5).forEach(t => generatedTags.add(t));
            }
            
            hideLoading();
            
            // Mostrar passo 4
            document.getElementById('step4').style.display = 'block';
            document.getElementById('mainTopic').innerHTML = `<h3>🎯 Tema Principal</h3><p>${mainTopic || 'Não identificado'}</p>`;
            document.getElementById('totalTags').textContent = generatedTags.size;
            document.getElementById('wordCount').textContent = textToAnalyze.split(/\s+/).length;
            
            renderGeneratedTags();
            
            // Scroll
            setTimeout(() => {
                document.getElementById('step4').scrollIntoView({ behavior: 'smooth' });
            }, 300);
            
        } catch (error) {
            hideLoading();
            showStatus('analysisStatus', '❌ Erro na análise: ' + error.message, 'error');
        }
    }, 500);
}

// ===== FUNÇÕES DE ANÁLISE NLP =====

function advancedTFIDF(text) {
    const words = text.toLowerCase()
        .replace(/[^\wáéíóúâêîôûàèìòùãõäëïöüç\s-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopwords.has(word));

    const termFreq = {};
    words.forEach(word => {
        termFreq[word] = (termFreq[word] || 0) + 1;
    });

    const maxFreq = Math.max(...Object.values(termFreq));
    const results = [];
    
    for (let term in termFreq) {
        const tf = termFreq[term] / maxFreq;
        const lengthBoost = Math.min(term.length / 8, 1.8);
        results.push({ term, score: tf * lengthBoost });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 15);
}

function extractNGrams(text) {
    const words = text.toLowerCase().replace(/[^\wáéíóúâêîôûàèìòùãõäëïöüç\s-]/g, ' ').split(/\s+/);
    const bigrams = {};
    const trigrams = {};

    for (let i = 0; i < words.length - 1; i++) {
        if (words[i].length > 3 && words[i + 1].length > 3 && !stopwords.has(words[i]) && !stopwords.has(words[i + 1])) {
            const phrase = words[i] + ' ' + words[i + 1];
            bigrams[phrase] = (bigrams[phrase] || 0) + 1;
        }
    }

    for (let i = 0; i < words.length - 2; i++) {
        if (words[i].length > 2 && words[i + 1].length > 2 && words[i + 2].length > 2) {
            const stopwordCount = [words[i], words[i + 1], words[i + 2]].filter(w => stopwords.has(w)).length;
            if (stopwordCount <= 1) {
                const phrase = words[i] + ' ' + words[i + 1] + ' ' + words[i + 2];
                trigrams[phrase] = (trigrams[phrase] || 0) + 1;
            }
        }
    }

    const results = [];
    for (let phrase in trigrams) {
        if (trigrams[phrase] >= 2) results.push({ phrase, score: trigrams[phrase] * 3.0 });
    }
    for (let phrase in bigrams) {
        if (bigrams[phrase] >= 2) results.push({ phrase, score: bigrams[phrase] * 1.8 });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

function extractEntities(text) {
    if (typeof nlp === 'undefined') return {};
    try {
        const doc = nlp(text);
        return {
            topics: doc.topics().out('array').slice(0, 10)
        };
    } catch {
        return {};
    }
}

function detectMainTopic(text, tfidfTerms, phrases) {
    const topTerms = tfidfTerms.slice(0, 5).map(t => t.term).join(' ');
    const topPhrases = phrases.slice(0, 3).map(p => p.phrase).join(' ');
    const combined = (topTerms + ' ' + topPhrases).toLowerCase();
    
    const patterns = [
        { regex: /intelig[eê]ncia|artificial|machine|learning|deep/, topic: 'Inteligência Artificial' },
        { regex: /medicina|m[eé]dico|sa[úu]de|cl[íi]nic/, topic: 'Medicina e Saúde' },
        { regex: /dados|data|estat[íi]stic/, topic: 'Ciência de Dados' },
        { regex: /biol[oó]gic|gen[eé]tic|dna/, topic: 'Biologia' },
    ];
    
    for (let p of patterns) {
        if (p.regex.test(combined)) return p.topic;
    }
    
    return phrases[0]?.phrase || tfidfTerms[0]?.term || null;
}

// ===== PASSO 4: REVISAR E EXPORTAR =====

function renderGeneratedTags() {
    const container = document.getElementById('generatedTags');
    container.innerHTML = '';
    
    generatedTags.forEach(tag => {
        const tagEl = document.createElement('div');
        tagEl.className = 'tag removable';
        tagEl.textContent = tag;
        tagEl.onclick = () => {
            generatedTags.delete(tag);
            renderGeneratedTags();
            document.getElementById('totalTags').textContent = generatedTags.size;
        };
        container.appendChild(tagEl);
    });
}

function addCustomTag() {
    const input = document.getElementById('customTagInput');
    const tag = input.value.trim();
    
    if (tag && tag.length > 1) {
        generatedTags.add(tag);
        renderGeneratedTags();
        document.getElementById('totalTags').textContent = generatedTags.size;
        input.value = '';
    }
}

async function exportTagsToZotero() {
    if (generatedTags.size === 0) {
        showStatus('exportStatus', 'Nenhuma tag para exportar.', 'error');
        return;
    }
    
    showLoading('Exportando tags para Zotero...');
    
    try {
        // Buscar versão atual do item
        const itemResponse = await fetch(
            `https://api.zotero.org/users/${zoteroConfig.userId}/items/${selectedArticle.key}`,
            {
                headers: {
                    'Zotero-API-Key': zoteroConfig.apiKey,
                    'Zotero-API-Version': '3'
                }
            }
        );
        
        if (!itemResponse.ok) throw new Error('Erro ao buscar item');
        
        const currentItem = await itemResponse.json();
        const currentVersion = currentItem.version;
        
        // Mesclar tags existentes com novas
        const existingTags = currentItem.data.tags || [];
        const existingTagNames = new Set(existingTags.map(t => t.tag.toLowerCase()));
        
        const newTags = [...existingTags];
        generatedTags.forEach(tag => {
            if (!existingTagNames.has(tag.toLowerCase())) {
                newTags.push({ tag });
            }
        });
        
        // Atualizar item
        currentItem.data.tags = newTags;
        
        const updateResponse = await fetch(
            `https://api.zotero.org/users/${zoteroConfig.userId}/items/${selectedArticle.key}`,
            {
                method: 'PUT',
                headers: {
                    'Zotero-API-Key': zoteroConfig.apiKey,
                    'Zotero-API-Version': '3',
                    'Content-Type': 'application/json',
                    'If-Unmodified-Since-Version': currentVersion.toString()
                },
                body: JSON.stringify(currentItem.data)
            }
        );
        
        if (!updateResponse.ok) {
            throw new Error('Erro ao atualizar item');
        }
        
        hideLoading();
        showStatus('exportStatus', `✅ ${generatedTags.size} tags exportadas com sucesso!`, 'success');
        
    } catch (error) {
        hideLoading();
        showStatus('exportStatus', '❌ Erro: ' + error.message, 'error');
    }
}

function startOver() {
    selectedArticle = null;
    extractedText = '';
    generatedTags.clear();
    
    document.getElementById('step3').style.display = 'none';
    document.getElementById('step4').style.display = 'none';
    document.getElementById('articleText').value = '';
    document.getElementById('manualInput').style.display = 'none';
    document.getElementById('textPreview').style.display = 'none';
    
    document.querySelectorAll('.article-item').forEach(el => el.classList.remove('selected'));
    
    document.getElementById('step2').scrollIntoView({ behavior: 'smooth' });
}

// ===== FUNÇÕES AUXILIARES =====

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.className = 'status-message show ' + type;
}

function showLoading(message) {
    document.getElementById('loadingMessage').textContent = message;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// ===== INICIALIZAÇÃO =====

window.addEventListener('load', () => {
    // Carregar credenciais salvas
    const savedApiKey = localStorage.getItem('zoteroApiKey');
    const savedUserId = localStorage.getItem('zoteroUserId');
    
    if (savedApiKey) document.getElementById('zoteroApiKey').value = savedApiKey;
    if (savedUserId) document.getElementById('zoteroUserId').value = savedUserId;
    
    // Configurar PDF.js
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
});