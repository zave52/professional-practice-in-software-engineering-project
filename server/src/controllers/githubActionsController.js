import {getRepositoryRefs, getWorkflowRuns} from '../services/githubActionsService.js';
import * as projectRepository from '../repositories/projectRepository.js';

export const getPipelines = async (req, res, next) => {
    try {
        const projects = await projectRepository.findAll();
        if (projects.length === 0) {
            return res.status(200).json(await getWorkflowRuns());
        }
        const runsByProject = await Promise.all(projects.map(async (project) => {
            const repository = new URL(project.repo_url).pathname.replace(/^\/|\/$/g, '');
            const runs = await getWorkflowRuns(repository);
            return runs.map((run) => ({...run, project_id: project.id}));
        }));
        return res.status(200).json(runsByProject.flat());
    } catch (error) {
        return next(error);
    }
};

export const getRefs = async (req, res, next) => {
    try {
        const project = req.query.project_id
            ? await projectRepository.findById(Number(req.query.project_id))
            : null;
        if (req.query.project_id && !project) {
            return res.status(404).json({status: 404, message: 'Project not found.'});
        }
        const repository = project
            ? new URL(project.repo_url).pathname.replace(/^\/|\/$/g, '')
            : undefined;
        return res.status(200).json(await getRepositoryRefs(repository));
    } catch (error) {
        return next(error);
    }
};
