import crypto from 'node:crypto';
import * as deploymentRepository from '../repositories/deploymentRepository.js';
import * as projectRepository from '../repositories/projectRepository.js';
import {DeploymentContext} from '../patterns/state/DeploymentContext.js';
import {AuditLogObserver} from '../patterns/observer/AuditLogObserver.js';
import {MetricsObserver} from '../patterns/observer/MetricsObserver.js';
import {DEPLOYMENT_EVENTS, deploymentPublisher} from '../patterns/observer/DeploymentPublisher.js';
import {cancelWorkflowRun, dispatchDeployment, rerunWorkflowRun} from './githubActionsService.js';

export const auditLogObserver = new AuditLogObserver();
export const metricsObserver = new MetricsObserver();
deploymentPublisher.subscribe(auditLogObserver);
deploymentPublisher.subscribe(metricsObserver);

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

export const triggerDeployment = async ({projectId, versionTag, triggeredBy, ref, createTag, tagName, accessToken}) => {
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

    const dispatch = await dispatchDeployment({
        repository,
        workflowId: project.workflow_id,
        ref: typeof ref === 'string' && ref.trim() ? ref.trim() : 'main',
        createTag: Boolean(createTag),
        tagName: typeof tagName === 'string' ? tagName.trim() : tagName,
        accessToken,
    });

    const deployment = {
        projectId: normalizedProjectId,
        triggered_by: triggeredBy || project.user_id,
        version_tag: versionTag.trim(),
        commit_sha: crypto.randomBytes(20).toString('hex'),
        deploy_status: 'RUNNING',
        workflow_ref: dispatch.ref,
        tag_created: dispatch.tag_created,
    };
    deploymentPublisher.notify(DEPLOYMENT_EVENTS.TRIGGERED, deployment);
    return deployment;
};

export const deleteDeployment = async (id, projectId, accessToken) => {
    const deploymentId = toPositiveInteger(id, 'Deployment id');
    const project = await projectRepository.findById(toPositiveInteger(projectId, 'Project id'));
    if (!project) {
        const error = new Error('Project not found.');
        error.status = 404;
        throw error;
    }
    const repository = new URL(project.repo_url).pathname.replace(/^\/|\/$/g, '');
    const deployment = await deploymentRepository.findById(deploymentId);
    const context = new DeploymentContext(deployment?.deploy_status || 'RUNNING');
    context.cancel();
    const result = await cancelWorkflowRun(
        deploymentId,
        repository,
        ...(accessToken ? [accessToken] : []),
    );
    deploymentPublisher.notify(DEPLOYMENT_EVENTS.CANCELED, {
        ...(deployment || {}),
        ...result,
        deploy_status: context.getStatus(),
    });
    return result;
};

export const rerunDeployment = async (id, projectId, accessToken) => {
    const deploymentId = toPositiveInteger(id, 'Deployment id');
    const project = await projectRepository.findById(toPositiveInteger(projectId, 'Project id'));
    if (!project) {
        const error = new Error('Project not found.');
        error.status = 404;
        throw error;
    }
    const repository = new URL(project.repo_url).pathname.replace(/^\/|\/$/g, '');
    const deployment = await deploymentRepository.findById(deploymentId);
    const context = new DeploymentContext(deployment?.deploy_status || 'SUCCESS');
    context.rerun();
    const result = await rerunWorkflowRun(
        deploymentId,
        repository,
        ...(accessToken ? [accessToken] : []),
    );
    deploymentPublisher.notify(DEPLOYMENT_EVENTS.RERUN, {
        ...(deployment || {}),
        ...result,
        deploy_status: context.getStatus(),
    });
    return result;
};
