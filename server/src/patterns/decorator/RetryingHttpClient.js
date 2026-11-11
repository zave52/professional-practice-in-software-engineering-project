import {HttpClientDecorator, NetworkError} from './HttpClient.js';

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

const defaultSleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

/**
 * Concrete decorator: retries idempotent requests on transient failures with exponential
 * backoff. Non-idempotent requests (POST: dispatch, cancel, rerun) are never repeated,
 * because repeating them could start a pipeline twice.
 */
export class RetryingHttpClient extends HttpClientDecorator {
    constructor(inner, {retries = 2, baseDelayMs = 250, sleep = defaultSleep} = {}) {
        super(inner);
        this.retries = retries;
        this.baseDelayMs = baseDelayMs;
        this.sleep = sleep;
    }

    async request(options) {
        const method = (options.method || 'GET').toUpperCase();
        const maxAttempts = IDEMPOTENT_METHODS.has(method) ? this.retries + 1 : 1;

        for (let attempt = 1; ; attempt += 1) {
            try {
                const response = await this.inner.request(options);
                if (!RETRYABLE_STATUSES.has(response.status) || attempt >= maxAttempts) {
                    return response;
                }
            } catch (error) {
                if (!(error instanceof NetworkError) || attempt >= maxAttempts) {
                    throw error;
                }
            }
            await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
        }
    }
}

export default RetryingHttpClient;
