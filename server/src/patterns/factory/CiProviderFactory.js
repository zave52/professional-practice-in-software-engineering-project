import {GitHubApiClient} from '../../integrations/github/GitHubApiClient.js';
import {GitHubActionsAdapter} from '../adapter/GitHubActionsAdapter.js';
import {FetchHttpClient} from '../decorator/HttpClient.js';
import {LoggingHttpClient} from '../decorator/LoggingHttpClient.js';
import {RetryingHttpClient} from '../decorator/RetryingHttpClient.js';
import {CachingGitHubClientProxy} from '../proxy/CachingGitHubClientProxy.js';

/**
 * Factory Method pattern.
 *
 * `createProvider()` is a template that fixes the assembly order of a CI provider
 * (transport -> API client -> adapter); subclasses override the factory methods that create
 * each part. Callers receive a ready CiProvider and never see the decorator/proxy stack.
 */
export class CiProviderFactory {
    createProvider() {
        const httpClient = this.createHttpClient();
        const apiClient = this.createApiClient(httpClient);
        return this.createAdapter(apiClient);
    }

    createHttpClient() {
        throw new Error('CiProviderFactory.createHttpClient must be implemented.');
    }

    // eslint-disable-next-line no-unused-vars
    createApiClient(httpClient) {
        throw new Error('CiProviderFactory.createApiClient must be implemented.');
    }

    // eslint-disable-next-line no-unused-vars
    createAdapter(apiClient) {
        throw new Error('CiProviderFactory.createAdapter must be implemented.');
    }
}

export class GitHubActionsProviderFactory extends CiProviderFactory {
    constructor({config, logger, fetchImpl = globalThis.fetch}) {
        super();
        this.config = config;
        this.logger = logger;
        this.fetchImpl = fetchImpl;
    }

    /** fetch -> LoggingHttpClient -> RetryingHttpClient (each retry attempt is logged). */
    createHttpClient() {
        const transport = new FetchHttpClient({
            fetchImpl: this.fetchImpl,
            timeoutMs: this.config.github.requestTimeoutMs,
        });
        return new RetryingHttpClient(
            new LoggingHttpClient(transport, this.logger),
            {retries: this.config.github.maxRetries},
        );
    }

    createApiClient(httpClient) {
        const client = new GitHubApiClient({httpClient, baseUrl: this.config.github.apiBaseUrl});
        this.cacheProxy = new CachingGitHubClientProxy(client, {ttlMs: this.config.github.cacheTtlMs});
        return this.cacheProxy;
    }

    createAdapter(apiClient) {
        return new GitHubActionsAdapter(apiClient);
    }
}

const factories = {
    github: GitHubActionsProviderFactory,
};

export const createCiProviderFactory = (type, dependencies) => {
    const Factory = factories[type];
    if (!Factory) {
        throw new Error(`Unsupported CI provider: ${type}`);
    }
    return new Factory(dependencies);
};
