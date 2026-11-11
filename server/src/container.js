import {createCiProviderFactory} from './patterns/factory/CiProviderFactory.js';
import {CommandInvoker} from './patterns/command/CommandInvoker.js';
import {DeploymentCommandFactory} from './patterns/command/deploymentCommands.js';
import {FetchHttpClient} from './patterns/decorator/HttpClient.js';
import {DeploymentFacade} from './patterns/facade/DeploymentFacade.js';
import {AuditLogObserver} from './patterns/observer/AuditLogObserver.js';
import {EventPublisher} from './patterns/observer/EventPublisher.js';
import {MetricsObserver} from './patterns/observer/MetricsObserver.js';
import {resolveAccessPolicy} from './patterns/strategy/access/AccessPolicy.js';
import {createDoraMetricsCalculator} from './patterns/strategy/metrics/MetricsCalculator.js';
import {AuditLogRepository} from './repositories/AuditLogRepository.js';
import {DeploymentRepository} from './repositories/DeploymentRepository.js';
import {ProjectRepository} from './repositories/ProjectRepository.js';
import {UserRepository} from './repositories/UserRepository.js';
import {AuthService} from './services/AuthService.js';
import {DeploymentSyncService} from './services/DeploymentSyncService.js';
import {MetricsService} from './services/MetricsService.js';
import {ProjectService} from './services/ProjectService.js';
import {TokenCipher} from './services/TokenCipher.js';

/**
 * Composition root (Dependency Injection). The only place that knows concrete classes and
 * how they are connected; every other module receives its collaborators via constructors,
 * which is what makes them testable with fakes. `overrides` replaces any component.
 */
export const createContainer = ({config, logger, database, fetchImpl = globalThis.fetch, overrides = {}}) => {
    const repositories = {
        users: new UserRepository(database),
        projects: new ProjectRepository(database),
        deployments: new DeploymentRepository(database),
        auditLog: new AuditLogRepository(database),
        ...overrides.repositories,
    };

    const ciProviderFactory = createCiProviderFactory('github', {config, logger, fetchImpl});
    const ciProvider = overrides.ciProvider ?? ciProviderFactory.createProvider();

    const publisher = new EventPublisher({logger});
    const activityObserver = new MetricsObserver();
    publisher.subscribe(new AuditLogObserver(repositories.auditLog));
    publisher.subscribe(activityObserver);

    const authService = overrides.authService ?? new AuthService({
        config,
        userRepository: repositories.users,
        tokenCipher: new TokenCipher(config.github.tokenEncryptionKey),
        httpClient: new FetchHttpClient({fetchImpl, timeoutMs: config.github.requestTimeoutMs}),
    });

    const projectService = new ProjectService({
        projectRepository: repositories.projects,
        ciProvider,
        publisher,
        resolvePolicy: resolveAccessPolicy,
    });

    const invoker = new CommandInvoker({publisher, logger});
    const commandFactory = new DeploymentCommandFactory({
        projectRepository: repositories.projects,
        deploymentRepository: repositories.deployments,
        ciProvider,
        publisher,
        resolvePolicy: resolveAccessPolicy,
    });

    const syncService = new DeploymentSyncService({
        ciProvider,
        deploymentRepository: repositories.deployments,
        publisher,
        logger,
    });

    const metricsService = new MetricsService({
        deploymentRepository: repositories.deployments,
        calculator: createDoraMetricsCalculator(),
        activityObserver,
    });

    const deploymentFacade = new DeploymentFacade({
        projectService,
        deploymentRepository: repositories.deployments,
        projectRepository: repositories.projects,
        auditLogRepository: repositories.auditLog,
        syncService,
        commandFactory,
        invoker,
        metricsService,
        resolvePolicy: resolveAccessPolicy,
    });

    return {
        config,
        logger,
        database,
        repositories,
        ciProvider,
        publisher,
        activityObserver,
        authService,
        projectService,
        syncService,
        invoker,
        deploymentFacade,
        cacheStats: () => ciProviderFactory.cacheProxy?.stats() ?? null,
    };
};

export default createContainer;
