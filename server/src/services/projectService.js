import * as projectRepository from '../repositories/projectRepository.js';

const environments = new Set(['production', 'staging', 'development']);
const githubUrlPattern = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/.*)?$/;

const toPositiveInteger = (value, fieldName) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        const error = new Error(`${fieldName} must be a positive integer.`);
        error.status = 400;
        throw error;
    }
    return parsed;
};

const validateProject = ({name, repoUrl, environment}) => {
    if (typeof name !== 'string' || name.trim().length < 3) {
        const error = new Error('Project name must be at least 3 characters long.');
        error.status = 400;
        throw error;
    }
    if (typeof repoUrl !== 'string' || !githubUrlPattern.test(repoUrl.trim())) {
        const error = new Error('Repository URL must use the https://github.com/... format.');
        error.status = 400;
        throw error;
    }
    if (!environments.has(environment)) {
        const error = new Error('Environment must be production, staging, or development.');
        error.status = 400;
        throw error;
    }
};

export const listProjects = async () => {
    const projects = await projectRepository.findAll();
    if (projects.length > 0) {
        return projects;
    }

    const repository = process.env.GITHUB_REPOSITORY
        || 'zave52/professional-practice-in-software-engineering-project';
    if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
        return projects;
    }

    await projectRepository.ensureConfiguredProject({repository});
    return projectRepository.findAll();
};

export const getProject = async (id) => {
    const project = await projectRepository.findById(toPositiveInteger(id, 'Project id'));
    if (!project) {
        const error = new Error('Project not found.');
        error.status = 404;
        throw error;
    }
    return project;
};

export const createProject = async ({userId, name, repoUrl, environment}) => {
    const normalized = {
        name: typeof name === 'string' ? name.trim() : name,
        repoUrl: typeof repoUrl === 'string' ? repoUrl.trim() : repoUrl,
        environment,
    };
    validateProject(normalized);
    const ownerId = userId || await projectRepository.ensureDefaultUser();
    return projectRepository.create({userId: ownerId, ...normalized});
};

export const deleteProject = async (id) => {
    const project = await projectRepository.remove(toPositiveInteger(id, 'Project id'));
    if (!project) {
        const error = new Error('Project not found.');
        error.status = 404;
        throw error;
    }
    return project;
};
