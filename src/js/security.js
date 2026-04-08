'use strict';

// Hard cap on API response payloads (512 KB) to prevent large-payload attacks.
export const MAX_RESPONSE_BYTES = 524_288;

// Strips null bytes and trims whitespace for safe .textContent insertion.
// Always pair with .textContent — never use the result in .innerHTML.
export function sanitizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\0/g, '').trim();
}

// Sanitizes HTML via DOMPurify for safe innerHTML insertion.
// Only needed when HTML structure matters (e.g. JATS abstracts from CrossRef).
// Falls back to text-only if DOMPurify is unavailable.
export function sanitizeHTML(html) {
    if (typeof html !== 'string') return '';
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'span', 'br', 'p', 'sup', 'sub'],
            ALLOWED_ATTR: [],
            FORCE_BODY: false,
        });
    }
    // Fallback: convert to plain text by creating a transient DOM node
    const tmp = document.createElement('div');
    tmp.textContent = html;
    return tmp.innerHTML;
}

// Reads a fetch Response as JSON with a hard byte-size cap.
// Guards against oversized payloads. Uses JSON.parse (never eval).
export async function readSafeJSON(response) {
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
        throw new Error('Resposta da API muito grande para processar com segurança.');
    }

    const text = await response.text();

    if (text.length > MAX_RESPONSE_BYTES) {
        throw new Error('Resposta da API muito grande para processar com segurança.');
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error('Resposta da API em formato inesperado (não é JSON válido).');
    }
}

// Rolling-window rate limiter. Tracks timestamps of recent calls and
// rejects when the count exceeds the configured threshold.
export class RateLimiter {
    #timestamps = [];
    #maxRequests;
    #windowMs;

    // @param maxRequests - max calls allowed within windowMs
    // @param windowMs    - rolling window in milliseconds
    constructor(maxRequests = 20, windowMs = 60_000) {
        this.#maxRequests = maxRequests;
        this.#windowMs = windowMs;
    }

    // Returns true if the call is allowed, false if throttled.
    check() {
        const now = Date.now();
        this.#timestamps = this.#timestamps.filter(t => now - t < this.#windowMs);
        if (this.#timestamps.length >= this.#maxRequests) return false;
        this.#timestamps.push(now);
        return true;
    }

    // Milliseconds until the oldest slot expires and a new call can be made.
    msUntilAvailable() {
        if (this.#timestamps.length < this.#maxRequests) return 0;
        const oldest = Math.min(...this.#timestamps);
        return Math.max(0, this.#windowMs - (Date.now() - oldest));
    }
}

// Zotero User ID: numeric, 1-12 digits.
export function validateUserId(id) {
    return typeof id === 'string' && /^\d{1,12}$/.test(id.trim());
}

// Zotero API key: alphanumeric, 16-64 chars. Does not verify live access.
export function validateApiKey(key) {
    return typeof key === 'string' && /^[a-zA-Z0-9]{16,64}$/.test(key.trim());
}

// Asserts that `obj` matches a type shape. Throws on missing keys or wrong types.
// shape values: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'optional-<type>'
export function assertSchema(obj, shape) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('Schema validation failed: expected a plain object.');
    }
    for (const [key, typeSpec] of Object.entries(shape)) {
        const optional = typeSpec.startsWith('optional-');
        const expectedType = optional ? typeSpec.slice(9) : typeSpec;

        if (!(key in obj)) {
            if (!optional) throw new Error(`Schema validation failed: missing required key "${key}".`);
            continue;
        }

        const val = obj[key];
        if (expectedType === 'array') {
            if (!Array.isArray(val)) {
                throw new Error(`Schema validation failed: "${key}" must be an array.`);
            }
        } else if (typeof val !== expectedType) {
            throw new Error(`Schema validation failed: "${key}" must be ${expectedType}, got ${typeof val}.`);
        }
    }
}
