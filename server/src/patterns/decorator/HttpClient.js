import {UpstreamError} from '../../errors/AppError.js';

/**
 * Component interface of the Decorator pattern.
 *
 * request({method, url, headers, body, token}) -> Promise<{status, ok, data, headers}>
 */
export class HttpClient {
    // eslint-disable-next-line no-unused-vars
    async request(options) {
        throw new Error('HttpClient.request must be implemented.');
    }
}

/** Raised when no HTTP response was received at all (DNS, TCP, TLS, timeout). */
export class NetworkError extends UpstreamError {
    constructor(message, {cause} = {}) {
        super(message, {cause});
        this.code = 'NETWORK_ERROR';
    }
}

/** Concrete component: performs the request with the platform `fetch`. */
export class FetchHttpClient extends HttpClient {
    constructor({fetchImpl = globalThis.fetch, timeoutMs = 10_000} = {}) {
        super();
        this.fetchImpl = fetchImpl;
        this.timeoutMs = timeoutMs;
    }

    async request({method = 'GET', url, headers = {}, body, token}) {
        const finalHeaders = {...headers};
        if (token) {
            finalHeaders.Authorization = `Bearer ${token}`;
        }
        if (body !== undefined) {
            finalHeaders['Content-Type'] = 'application/json';
        }

        let response;
        try {
            response = await this.fetchImpl(url, {
                method,
                headers: finalHeaders,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (cause) {
            throw new NetworkError(`Request to ${new URL(url).host} failed.`, {cause});
        }

        const text = await response.text();
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = text;
            }
        }
        return {status: response.status, ok: response.ok, data, headers: response.headers};
    }
}

/** Base decorator: keeps a reference to the wrapped component and forwards calls to it. */
export class HttpClientDecorator extends HttpClient {
    constructor(inner) {
        super();
        this.inner = inner;
    }

    request(options) {
        return this.inner.request(options);
    }
}
