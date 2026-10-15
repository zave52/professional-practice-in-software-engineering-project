import {getRepositoryRefs, getRepositoryWorkflows, getWorkflowRuns} from '../services/githubActionsService.js';
import * as projectRepository from '../repositories/projectRepository.js';

export const getPipelines = async (req, res, next) => {
    try {
        const projects = await projectRepository.findAll();
        if (projects.length === 0) {
            const deployments = await getWorkflowRuns(undefined, undefined, req.user.githubAccessToken);
            return res.status(200).json(deployments.sort(
                (left, right) => new Date(right.deployed_at) - new Date(left.deployed_at),
            ));
        }
        const runsByProject = await Promise.all(projects.map(async (project) => {
            const repository = new URL(project.repo_url).pathname.replace(/^\/|\/$/g, '');
            const runs = await getWorkflowRuns(repository, project.workflow_id, req.user.githubAccessToken);
            return runs.map((run) => ({...run, project_id: project.id}));
        }));
        const deployments = runsByProject.flat().sort(
            (left, right) => new Date(right.deployed_at) - new Date(left.deployed_at),
        );
        return res.status(200).json(deployments);
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
        return res.status(200).json(await getRepositoryRefs(repository, req.user.githubAccessToken));
    } catch (error) {
        return next(error);
    }
};

export const getWorkflows = async (req, res, next) => {
    try {
        const repoUrl = req.query.repo_url;
        if (!repoUrl) {
            return res.status(400).json({status: 400, message: 'Repository URL is required.'});
        }
        const repository = new URL(repoUrl).pathname.replace(/^\/|\/$/g, '');
        return res.status(200).json(await getRepositoryWorkflows(repository, req.user.githubAccessToken));
    } catch (error) {
        return next(error);
    }
};
