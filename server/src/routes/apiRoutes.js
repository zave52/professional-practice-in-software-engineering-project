import {Router} from 'express';

/**
 * Resource routes. Handlers are one-liners: validation, authorisation and orchestration live
 * in ProjectService and DeploymentFacade. Express 5 forwards rejected promises to the error
 * handler, so no try/catch is needed here.
 */
export const createProjectRoutes = ({projectService, authenticate}) => {
    const router = Router();
    router.use(authenticate);
    router.get('/', async (req, res) => res.json(await projectService.list(req.user)));
    router.post('/', async (req, res) => res.status(201).json(await projectService.create(req.user, {
        name: req.body?.name,
        repoUrl: req.body?.repo_url,
        workflowId: req.body?.workflow_id,
    })));
    router.get('/:id', async (req, res) => res.json(await projectService.get(req.user, req.params.id)));
    router.delete('/:id', async (req, res) => res.json(await projectService.remove(req.user, req.params.id)));
    router.get('/:id/refs', async (req, res) => res.json(await projectService.listRefs(req.user, req.params.id)));
    return router;
};

export const createRepositoryRoutes = ({projectService, authenticate}) => {
    const router = Router();
    router.use(authenticate);
    router.get('/workflows', async (req, res) => res.json(
        await projectService.listWorkflows(req.user, req.query.repo_url),
    ));
    return router;
};

export const createDeploymentRoutes = ({deploymentFacade, authenticate}) => {
    const router = Router();
    router.use(authenticate);
    router.get('/', async (req, res) => res.json(await deploymentFacade.listDeployments(req.user, {
        projectId: req.query.project_id,
        search: req.query.search,
        limit: req.query.limit,
    })));
    router.post('/', async (req, res) => res.status(201).json(await deploymentFacade.trigger(req.user, req.body)));
    router.get('/:id', async (req, res) => res.json(await deploymentFacade.getDeployment(req.user, req.params.id)));
    router.post('/:id/cancel', async (req, res) => res.json(await deploymentFacade.cancel(req.user, req.params.id)));
    router.post('/:id/rerun', async (req, res) => res.json(await deploymentFacade.rerun(req.user, req.params.id)));
    return router;
};

export const createInsightRoutes = ({deploymentFacade, authenticate}) => {
    const router = Router();
    router.get('/metrics', authenticate, async (req, res) => res.json(await deploymentFacade.getMetrics(req.user, {
        days: req.query.days ?? 30,
        projectId: req.query.project_id,
    })));
    router.get('/audit', authenticate, async (req, res) => res.json(await deploymentFacade.getAuditLog(req.user, {
        limit: req.query.limit,
    })));
    return router;
};
