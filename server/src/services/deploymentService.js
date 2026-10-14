import crypto from 'node:crypto';
import * as deploymentRepository from '../repositories/deploymentRepository.js';
import * as projectRepository from '../repositories/projectRepository.js';
import {cancelWorkflowRun, dispatchDeployment} from './githubActionsService.js';

const toPositiveInteger = (value, fieldName) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        const error = new Error(`${fieldName} must be a positive integer.`);
        error.status = 400;
        throw error;
    }
    return parsed;
};

export const listDeployments = () => deploymentRepository.findAll();

export const getDeployment = async (id) => {
    const deployment = await deploymentRepository.findById(toPositiveInteger(id, 'Deployment id'));
    if (!deployment) {
        const error = new Error('Deployment not found.');
        error.status = 404;
        throw error;
    }
    return deployment;
};

export const triggerDeployment = async ({projectId, versionTag, triggeredBy, ref, createTag, tagName}) => {
    const normalizedProjectId = toPositiveInteger(projectId, 'Project id');
    const project = await projectRepository.findById(normalizedProjectId);
    if (!project) {
        const error = new Error('Project not found.');
        error.status = 404;
        throw error;
    }

    if (typeof versionTag !== 'string' || versionTag.trim().length === 0 || versionTag.trim().length > 30) {
        const error = new Error('Version tag is required and must be no longer than 30 characters.');
        error.status = 400;
        throw error;
    }

    const repository = new URL(project.repo_url).pathname.replace(/^\/|\/$/g, '');
    const configuredRepository = process.env.GITHUB_REPOSITORY;
    if (configuredRepository && repository !== configuredRepository) {
        const error = new Error('The project repository does not match the configured GitHub repository.');
        error.status = 400;
        throw error;
    }

    const dispatch = await dispatchDeployment({
        ref: typeof ref === 'string' && ref.trim() ? ref.trim() : 'main',
        createTag: Boolean(createTag),
        tagName: typeof tagName === 'string' ? tagName.trim() : tagName,
    });

    return {
        projectId: normalizedProjectId,
        triggered_by: triggeredBy || project.user_id,
        version_tag: versionTag.trim(),
        commit_sha: crypto.randomBytes(20).toString('hex'),
        deploy_status: 'RUNNING',
        workflow_ref: dispatch.ref,
        tag_created: dispatch.tag_created,
    };
};

export const deleteDeployment = async (id) => {
    return cancelWorkflowRun(toPositiveInteger(id, 'Deployment id'));
};
