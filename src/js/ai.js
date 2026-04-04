'use strict';

// SECURITY: No eval(). Input is truncated before sending to the AI.
// Every string in the AI response is sanitized and length-capped.
// Requests race against a hard timeout to prevent hanging.

const MAX_INPUT_CHARS = 4_000;  // ~1 000 tokens — more than enough for an abstract
const AI_TIMEOUT_MS   = 45_000; // 45 s — generous for cold Puter starts
const AI_MODEL        = 'gpt-4o-mini'; // fast, cheap, accurate enough

// ── Session cache ─────────────────────────────────────────────────────────
// Avoids calling the AI twice for the same text within one browser session.
const _cache = new Map();

function _hashText(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = Math.imul(31, h) + text.charCodeAt(i) | 0;
    }
    return h;
}

// ── Prompt ────────────────────────────────────────────────────────────────
function _buildMessages(text) {
    const system = `You are an academic research assistant specialized in bibliographic metadata.
Analyse the provided article text and return ONLY a valid JSON object — no markdown, no explanation, no code fences.

Required schema:
{
  "tagBlocks": [
    { "name": "Conceitos-Chave",    "tags": ["...", "..."] },
    { "name": "Metodologia",        "tags": ["..."] },
    { "name": "Domínio de Pesquisa","tags": ["..."] },
    { "name": "Tipo de Estudo",     "tags": ["..."] }
  ],
  "theme":   "One sentence in Brazilian Portuguese starting with 'Este artigo'",
  "summary": "2-3 paragraphs in Brazilian Portuguese, plain text only"
}

Rules:
- ALL output text must be in Brazilian Portuguese (pt-BR).
- Tags: 2-4 words each, Title Case, specific (avoid vague terms like "Análise" alone).
- Include only tagBlocks that genuinely apply; 3-8 tags per block maximum.
- summary: plain prose only — no bullet points, no markdown, no asterisks.
- Return ONLY the JSON object. Absolutely nothing else.`;

    return [
        { role: 'system', content: system },
        { role: 'user',   content: `Article text:\n\n${text}` },
    ];
}

// ── Response validator & sanitizer ────────────────────────────────────────
// SECURITY: every value from the AI is treated as untrusted input.
function _parseResponse(raw) {
    // Strip markdown code fences the model might add despite instructions
    const cleaned = raw.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/,           '');

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        throw new Error('A IA retornou um formato inválido. Tente novamente.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Resposta da IA inesperada. Tente novamente.');
    }

    // Validate & sanitize tagBlocks
    if (!Array.isArray(parsed.tagBlocks) || parsed.tagBlocks.length === 0) {
        throw new Error('A IA não retornou tags. Tente novamente.');
    }

    const tagBlocks = parsed.tagBlocks
        .filter(b => b && typeof b.name === 'string' && Array.isArray(b.tags))
        .map(b => ({
            name: _sanitizeStr(b.name).slice(0, 60),
            tags: b.tags
                .filter(t => typeof t === 'string' && t.trim().length > 0)
                .map(t => _sanitizeStr(t).slice(0, 80))
                .slice(0, 12),
        }))
        .filter(b => b.name.length > 0 && b.tags.length > 0)
        .slice(0, 6);

    if (tagBlocks.length === 0) {
        throw new Error('Nenhuma tag válida na resposta da IA. Tente novamente.');
    }

    const theme   = _sanitizeStr(typeof parsed.theme   === 'string' ? parsed.theme   : '').slice(0, 300);
    const summary = _sanitizeStr(typeof parsed.summary === 'string' ? parsed.summary : '').slice(0, 3_000);

    return { tagBlocks, theme, summary };
}

// Remove null bytes and control characters; collapse whitespace
function _sanitizeStr(str) {
    return str
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Main export ───────────────────────────────────────────────────────────
export async function generateAnalysis(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('Texto inválido para análise.');
    }
    if (text.trim().length < 80) {
        throw new Error('Texto muito curto (mínimo 80 caracteres).');
    }

    // SECURITY: cap input before it leaves the browser
    const safeText = text.trim().slice(0, MAX_INPUT_CHARS);

    // Return cached result for identical text in the same session
    const cacheKey = _hashText(safeText);
    if (_cache.has(cacheKey)) return _cache.get(cacheKey);

    // Puter.js is loaded as a global <script> before this module
    if (typeof puter === 'undefined') {
        throw new Error('Serviço de IA não carregado. Recarregue a página.');
    }

    const messages = _buildMessages(safeText);

    // SECURITY: hard timeout so a stalled request never blocks the UI forever
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
            () => reject(new Error('A análise demorou muito. Verifique sua conexão e tente novamente.')),
            AI_TIMEOUT_MS
        );
    });

    let raw;
    try {
        const response = await Promise.race([
            puter.ai.chat(messages, { model: AI_MODEL }),
            timeoutPromise,
        ]);
        clearTimeout(timeoutId);

        // Puter returns { message: { content: string } } — handle variants defensively
        raw = response?.message?.content
            ?? response?.content
            ?? String(response ?? '');
    } catch (err) {
        clearTimeout(timeoutId);
        const msg = err?.message ?? '';
        if (msg.includes('demorou') || msg.includes('timeout')) throw err;
        if (/auth|login|sign.?in|account/i.test(msg)) {
            throw new Error('Entre com uma conta Puter gratuita para usar a análise por IA.');
        }
        throw new Error(`Erro na análise por IA: ${msg || 'tente novamente.'}`);
    }

    if (!raw || typeof raw !== 'string' || raw.trim().length < 10) {
        throw new Error('A IA retornou uma resposta vazia. Tente novamente.');
    }

    const result = _parseResponse(raw);
    _cache.set(cacheKey, result);
    return result;
}
