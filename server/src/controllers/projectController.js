import * as projectService from '../services/projectService.js';

export const getProjects = async (req, res, next) => {
    try {
        return res.status(200).json(await projectService.listProjects());
    } catch (error) {
        return next(error);
    }
};

export const getProject = async (req, res, next) => {
    try {
        return res.status(200).json(await projectService.getProject(req.params.id));
    } catch (error) {
        return next(error);
    }
};

export const createProject = async (req, res, next) => {
    try {
        const project = await projectService.createProject({
            userId: req.user?.id,
            name: req.body?.name,
            repoUrl: req.body?.repo_url,
            workflowId: req.body?.workflow_id,
            workflowName: req.body?.workflow_name,
        });
        return res.status(201).json(project);
    } catch (error) {
        return next(error);
    }
};

export const deleteProject = async (req, res, next) => {
    try {
        return res.status(200).json(await projectService.deleteProject(req.params.id));
    } catch (error) {
        return next(error);
    }
};
