import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import {createAuthenticate, createOptionalAuthenticate} from './middleware/authenticate.js';
import {createErrorHandler, notFoundHandler} from './middleware/errorHandler.js';
import {
    createDeploymentRoutes,
    createInsightRoutes,
    createProjectRoutes,
    createRepositoryRoutes,
} from './routes/apiRoutes.js';
import {createAuthRoutes} from './routes/authRoutes.js';

const limiter = ({windowMs, limit}) => rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
    }),
});

/** Builds the Express application from an already wired container (see container.js). */
export const createApp = (container) => {
    const {config, logger, database, authService, projectService, deploymentFacade} = container;
    const authenticate = createAuthenticate(authService);
    const optionalAuthenticate = createOptionalAuthenticate(authService);
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);
    app.use(helmet());
    app.use(cors({origin: config.clientOrigin, credentials: true}));
    app.use(express.json({limit: '1mb'}));

    app.get('/api/health', async (req, res) => {
        try {
            await database.ping();
            res.json({status: 'ok', version: config.appVersion, db: 'connected', timestamp: new Date().toISOString()});
        } catch (error) {
            logger.error('Health check failed', {error});
            res.status(503).json({status: 'error', version: config.appVersion, db: 'unavailable'});
        }
    });

    app.use('/api', limiter({windowMs: config.rateLimit.windowMs, limit: config.rateLimit.max}));
    app.use('/api/auth', limiter({windowMs: config.rateLimit.windowMs, limit: config.rateLimit.authMax}),
        createAuthRoutes({authService, config, logger, optionalAuthenticate}));
    app.use('/api/projects', createProjectRoutes({projectService, authenticate}));
    app.use('/api/repositories', createRepositoryRoutes({projectService, authenticate}));
    app.use('/api/deployments', createDeploymentRoutes({deploymentFacade, authenticate}));
    app.use('/api', createInsightRoutes({deploymentFacade, authenticate}));

    app.use(notFoundHandler);
    app.use(createErrorHandler(logger));
    return app;
};

export default createApp;
