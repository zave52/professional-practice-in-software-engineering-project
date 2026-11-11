import {HttpClientDecorator} from './HttpClient.js';

/**
 * Concrete decorator: records method, host, path, status and duration of every outgoing
 * request. The access token and query string are never logged.
 */
export class LoggingHttpClient extends HttpClientDecorator {
    constructor(inner, logger, {now = () => performance.now()} = {}) {
        super(inner);
        this.logger = logger;
        this.now = now;
    }

    async request(options) {
        const startedAt = this.now();
        const {host, pathname} = new URL(options.url);
        const fields = {method: options.method || 'GET', host, path: pathname};
        try {
            const response = await this.inner.request(options);
            this.logger.debug('Outgoing HTTP request', {
                ...fields,
                status: response.status,
                durationMs: Math.round(this.now() - startedAt),
            });
            return response;
        } catch (error) {
            this.logger.warn('Outgoing HTTP request failed', {
                ...fields,
                durationMs: Math.round(this.now() - startedAt),
                reason: error.message,
            });
            throw error;
        }
    }
}

export default LoggingHttpClient;
