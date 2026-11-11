import {describe, expect, it, vi} from 'vitest';
import {FetchHttpClient, HttpClient, HttpClientDecorator, NetworkError} from '../../src/patterns/decorator/HttpClient.js';
import {LoggingHttpClient} from '../../src/patterns/decorator/LoggingHttpClient.js';
import {RetryingHttpClient} from '../../src/patterns/decorator/RetryingHttpClient.js';
import {jsonResponse} from '../helpers/fixtures.js';

const stubClient = (...responses) => {
    const client = new HttpClient();
    client.request = vi.fn();
    responses.forEach((response) => {
        if (response instanceof Error) {
            client.request.mockRejectedValueOnce(response);
        } else {
            client.request.mockResolvedValueOnce(response);
        }
    });
    return client;
};

describe('Decorator pattern: HTTP client stack', () => {
    it('FetchHttpClient sends JSON with a bearer token and parses the response', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ok: 1}), {status: 201}));
        const client = new FetchHttpClient({fetchImpl, timeoutMs: 1000});

        const response = await client.request({method: 'POST', url: 'https://api.test/x', body: {a: 1}, token: 't0k'});

        expect(response).toMatchObject({status: 201, ok: true, data: {ok: 1}});
        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers).toMatchObject({Authorization: 'Bearer t0k', 'Content-Type': 'application/json'});
        expect(init.body).toBe('{"a":1}');
    });

    it('FetchHttpClient keeps non-JSON bodies, handles empty bodies and wraps network failures', async () => {
        const text = new FetchHttpClient({fetchImpl: vi.fn().mockResolvedValue(new Response('plain', {status: 200}))});
        expect((await text.request({url: 'https://api.test/'})).data).toBe('plain');

        const empty = new FetchHttpClient({fetchImpl: vi.fn().mockResolvedValue(new Response(null, {status: 204}))});
        expect((await empty.request({url: 'https://api.test/'})).data).toBeNull();

        const broken = new FetchHttpClient({fetchImpl: vi.fn().mockRejectedValue(new TypeError('socket hang up'))});
        await expect(broken.request({url: 'https://api.test/'})).rejects.toBeInstanceOf(NetworkError);
        await expect(new HttpClient().request({})).rejects.toThrow('must be implemented');
    });

    it('base decorator forwards to the wrapped component', async () => {
        const inner = stubClient(jsonResponse(200, 'x'));
        await expect(new HttpClientDecorator(inner).request({url: 'u'})).resolves.toMatchObject({data: 'x'});
    });

    it('RetryingHttpClient retries idempotent requests on 5xx and network errors with backoff', async () => {
        const inner = stubClient(new NetworkError('down'), jsonResponse(503, null), jsonResponse(200, 'done'));
        const sleep = vi.fn().mockResolvedValue();
        const client = new RetryingHttpClient(inner, {retries: 2, baseDelayMs: 100, sleep});

        await expect(client.request({method: 'GET', url: 'https://api.test/'})).resolves.toMatchObject({data: 'done'});
        expect(inner.request).toHaveBeenCalledTimes(3);
        expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200]);
    });

    it('RetryingHttpClient never repeats POST and gives up after the last attempt', async () => {
        const post = stubClient(jsonResponse(502, null));
        const client = new RetryingHttpClient(post, {sleep: vi.fn()});
        await expect(client.request({method: 'POST', url: 'https://api.test/'})).resolves.toMatchObject({status: 502});
        expect(post.request).toHaveBeenCalledTimes(1);

        const failing = stubClient(new NetworkError('a'), new NetworkError('b'));
        await expect(new RetryingHttpClient(failing, {retries: 1, sleep: vi.fn()}).request({url: 'https://x/'}))
            .rejects.toThrow('b');

        const fatal = stubClient(new Error('bug'));
        await expect(new RetryingHttpClient(fatal, {sleep: vi.fn()}).request({url: 'https://x/'})).rejects.toThrow('bug');
        expect(fatal.request).toHaveBeenCalledTimes(1);
    });

    it('LoggingHttpClient logs status and duration without the token or query string', async () => {
        const logger = {debug: vi.fn(), warn: vi.fn()};
        let time = 0;
        const client = new LoggingHttpClient(stubClient(jsonResponse(200, {})), logger, {now: () => (time += 5)});

        await client.request({url: 'https://api.github.com/repos/a/b?per_page=5', token: 'secret-token'});

        expect(logger.debug).toHaveBeenCalledWith('Outgoing HTTP request', {
            method: 'GET', host: 'api.github.com', path: '/repos/a/b', status: 200, durationMs: 5,
        });
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain('secret-token');

        const failing = new LoggingHttpClient(stubClient(new NetworkError('boom')), logger);
        await expect(failing.request({url: 'https://api.github.com/x'})).rejects.toThrow('boom');
        expect(logger.warn).toHaveBeenCalledWith('Outgoing HTTP request failed', expect.objectContaining({reason: 'boom'}));
    });
});
