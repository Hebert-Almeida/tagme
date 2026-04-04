'use strict';

// SECURITY: Maximum allowed response payload (512 KB)
export const MAX_RESPONSE_BYTES = 524_288;

// SECURITY: Sanitize a value for safe insertion via textContent.
// Strips null bytes, normalizes whitespace. Always use with .textContent, never .innerHTML.
export function sanitizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\0/g, '').trim();
}

// SECURITY: Sanitize HTML for safe innerHTML insertion using DOMPurify.
// Only call this when HTML structure is genuinely needed (e.g. rendering JATS abstracts).
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

// SECURITY: Read a fetch Response as JSON, enforcing a hard byte-size cap.
// Prevents zip-bomb and large-payload attacks. Never uses eval().
export async function readSafeJSON(response) {
    // Check declared size first (not always present)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
        throw new Error('Resposta da API muito grande para processar com segurança.');
    }

    const text = await response.text();

    // SECURITY: validate actual payload size
    if (text.length > MAX_RESPONSE_BYTES) {
        throw new Error('Resposta da API muito grande para processar com segurança.');
    }

    // SECURITY: parse without eval()
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('Resposta da API em formato inesperado (não é JSON válido).');
    }
}

// SECURITY: Client-side rate limiter.
// Tracks timestamps of recent calls; rejects if over the configured threshold.
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
        // Prune expired timestamps
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

// SECURITY: Validate a Zotero User ID (must be numeric, 1–12 digits).
export function validateUserId(id) {
    return typeof id === 'string' && /^\d{1,12}$/.test(id.trim());
}

// SECURITY: Basic format check for a Zotero API key (alphanumeric, 16–64 chars).
// Does not guarantee the key is valid — that requires a live API call.
export function validateApiKey(key) {
    return typeof key === 'string' && /^[a-zA-Z0-9]{16,64}$/.test(key.trim());
}

// SECURITY: Assert that obj has the expected keys and types.
// Throws a descriptive error rather than silently consuming malformed API data.
// shape: Record<string, 'string'|'number'|'boolean'|'object'|'array'|`optional-${type}`>
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
