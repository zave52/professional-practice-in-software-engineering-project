import * as deploymentService from '../services/deploymentService.js';

export const getDeployments = async (req, res, next) => {
    try {
        return res.status(200).json(await deploymentService.listDeployments());
    } catch (error) {
        return next(error);
    }
};

export const getDeployment = async (req, res, next) => {
    try {
        return res.status(200).json(await deploymentService.getDeployment(req.params.id));
    } catch (error) {
        return next(error);
    }
};

export const triggerDeployment = async (req, res, next) => {
    try {
        const deployment = await deploymentService.triggerDeployment({
            projectId: req.body?.project_id,
            versionTag: req.body?.version_tag,
            triggeredBy: req.user?.id,
            ref: req.body?.ref,
            createTag: req.body?.create_tag,
            tagName: req.body?.tag_name,
        });
        return res.status(201).json(deployment);
    } catch (error) {
        return next(error);
    }
};

export const deleteDeployment = async (req, res, next) => {
    try {
        return res.status(200).json(await deploymentService.deleteDeployment(
            req.params.id,
            req.body?.project_id,
        ));
    } catch (error) {
        return next(error);
    }
};

export const rerunDeployment = async (req, res, next) => {
    try {
        return res.status(200).json(await deploymentService.rerunDeployment(
            req.params.id,
            req.body?.project_id,
        ));
    } catch (error) {
        return next(error);
    }
};
