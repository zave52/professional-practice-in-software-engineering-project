import {getRepositoryRefs, getWorkflowRuns} from '../services/githubActionsService.js';

export const getPipelines = async (req, res, next) => {
    try {
        return res.status(200).json(await getWorkflowRuns());
    } catch (error) {
        return next(error);
    }
};

export const getRefs = async (req, res, next) => {
    try {
        return res.status(200).json(await getRepositoryRefs());
    } catch (error) {
        return next(error);
    }
};
