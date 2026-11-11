/* eslint-disable no-unused-vars */

/**
 * Target interface of the Adapter pattern: what the application needs from any CI system.
 * Services depend only on this interface, never on GitHub payloads, so another provider
 * (GitLab CI, Jenkins) can be added by writing one more adapter.
 *
 * PipelineRun = {
 *   runId, runNumber, runAttempt, workflowId, workflowName, status, ref, commitSha,
 *   commitAt, actorLogin, event, url, startedAt, finishedAt
 * }
 * status is one of RUNNING | SUCCESS | FAILED | CANCELED.
 */
export class CiProvider {
    listPipelineRuns({repository, workflowId, accessToken}) {
        throw new Error('CiProvider.listPipelineRuns must be implemented.');
    }

    getPipelineRun({repository, runId, accessToken}) {
        throw new Error('CiProvider.getPipelineRun must be implemented.');
    }

    listPipelines({repository, accessToken}) {
        throw new Error('CiProvider.listPipelines must be implemented.');
    }

    listRefs({repository, accessToken}) {
        throw new Error('CiProvider.listRefs must be implemented.');
    }

    triggerPipeline({repository, workflowId, ref, createTag, tagName, accessToken}) {
        throw new Error('CiProvider.triggerPipeline must be implemented.');
    }

    cancelPipelineRun({repository, runId, accessToken}) {
        throw new Error('CiProvider.cancelPipelineRun must be implemented.');
    }

    rerunPipelineRun({repository, runId, accessToken}) {
        throw new Error('CiProvider.rerunPipelineRun must be implemented.');
    }
}

export default CiProvider;
