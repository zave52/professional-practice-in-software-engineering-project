import {CiProvider} from './CiProvider.js';

/**
 * Adapter pattern (object adapter).
 *
 * Adaptee: GitHubApiClient, which speaks GitHub's vocabulary (status + conclusion,
 * head_branch, head_sha, run_started_at ...).
 * Target:  CiProvider, which speaks the dashboard's vocabulary (PipelineRun with
 * RUNNING/SUCCESS/FAILED/CANCELED).
 */
export class GitHubActionsAdapter extends CiProvider {
    constructor(client, {now = () => new Date()} = {}) {
        super();
        this.client = client;
        this.now = now;
    }

    static toDomainStatus(run) {
        if (run.status !== 'completed') {
            return 'RUNNING';
        }
        if (run.conclusion === 'success') {
            return 'SUCCESS';
        }
        if (run.conclusion === 'cancelled' || run.conclusion === 'skipped') {
            return 'CANCELED';
        }
        return 'FAILED';
    }

    static toPipelineRun(run) {
        const status = GitHubActionsAdapter.toDomainStatus(run);
        return {
            runId: run.id,
            runNumber: run.run_number ?? null,
            runAttempt: run.run_attempt ?? 1,
            workflowId: run.workflow_id ?? null,
            workflowName: run.name || null,
            status,
            ref: run.head_branch || run.display_title || null,
            commitSha: run.head_sha || null,
            commitAt: run.head_commit?.timestamp || null,
            actorLogin: run.triggering_actor?.login || run.actor?.login || null,
            event: run.event || null,
            url: run.html_url || null,
            startedAt: run.run_started_at || run.created_at || null,
            finishedAt: status === 'RUNNING' ? null : run.updated_at || null,
        };
    }

    async listPipelineRuns({repository, workflowId, accessToken}) {
        const runs = await this.client.listWorkflowRuns(repository, {
            workflowId: workflowId || undefined,
            token: accessToken,
        });
        return runs.map((run) => GitHubActionsAdapter.toPipelineRun(run));
    }

    async getPipelineRun({repository, runId, accessToken}) {
        return GitHubActionsAdapter.toPipelineRun(
            await this.client.getWorkflowRun(repository, runId, {token: accessToken}),
        );
    }

    async listPipelines({repository, accessToken}) {
        const workflows = await this.client.listWorkflows(repository, {token: accessToken});
        return workflows.map(({id, name, path, state}) => ({id, name, path, state}));
    }

    async listRefs({repository, accessToken}) {
        const [branches, tags] = await Promise.all([
            this.client.listBranches(repository, {token: accessToken}),
            this.client.listTags(repository, {token: accessToken}),
        ]);
        return {
            branches: branches.map((branch) => branch.name),
            tags: tags.map((tag) => tag.name),
        };
    }

    async triggerPipeline({repository, workflowId, ref, createTag = false, tagName, accessToken}) {
        let dispatchRef = ref;
        if (createTag) {
            const sha = await this.client.getBranchHeadSha(repository, ref, {token: accessToken});
            await this.client.createTagRef(repository, tagName, sha, {token: accessToken});
            dispatchRef = tagName;
        }
        const dispatchedAt = this.now();
        await this.client.dispatchWorkflow(repository, workflowId, dispatchRef, {token: accessToken});
        return {ref: dispatchRef, tagCreated: Boolean(createTag), dispatchedAt};
    }

    async cancelPipelineRun({repository, runId, accessToken}) {
        await this.client.cancelWorkflowRun(repository, runId, {token: accessToken});
        return {runId: Number(runId), cancelRequested: true};
    }

    async rerunPipelineRun({repository, runId, accessToken}) {
        await this.client.rerunWorkflowRun(repository, runId, {token: accessToken});
        return {runId: Number(runId), rerunRequested: true};
    }
}

export default GitHubActionsAdapter;
