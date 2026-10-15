const githubApiBaseUrl = 'https://api.github.com';

const getRepository = (configuredRepository) => {
    const repository = configuredRepository
        || process.env.GITHUB_REPOSITORY
        || 'zave52/professional-practice-in-software-engineering-project';
    if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
        const error = new Error('GITHUB_REPOSITORY must use the owner/repository format.');
        error.status = 500;
        throw error;
    }
    return repository;
};

const getHeaders = (accessToken) => {
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    const token = accessToken || process.env.GITHUB_TOKEN;
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
};

const githubRequest = async (url, options = {}, accessToken) => {
    const response = await fetch(url, {
        ...options,
        headers: {...getHeaders(accessToken), ...options.headers},
    });
    if (!response.ok) {
        const error = new Error(
            response.status === 401 || response.status === 403
                ? 'GitHub rejected the request. Check the token permissions.'
                : `GitHub API returned ${response.status}.`,
        );
        error.status = response.status === 404 ? 404 : 502;
        throw error;
    }
    return [202, 204].includes(response.status) ? null : response.json();
};

const mapRunStatus = (run) => {
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
};

export const getWorkflowRuns = async (configuredRepository, workflowId, accessToken) => {
    const repository = getRepository(configuredRepository);
    const workflowQuery = workflowId ? `&workflow_id=${encodeURIComponent(workflowId)}` : '';
    const response = await fetch(
        `${githubApiBaseUrl}/repos/${repository}/actions/runs?per_page=50${workflowQuery}`,
        {headers: getHeaders(accessToken)},
    );

    if (!response.ok) {
        const error = new Error(
            response.status === 404
                ? 'GitHub repository was not found or is private. Configure a token with Actions read access.'
                : response.status === 401 || response.status === 403
                    ? 'GitHub rejected the API request. Configure a valid token with Actions read access.'
                    : `GitHub Actions API returned ${response.status}.`,
        );
        error.status = response.status === 404 ? 404 : 502;
        throw error;
    }

    const payload = await response.json();
    return (payload.workflow_runs || []).map((run) => ({
        id: run.id,
        project_id: null,
        workflow_name: run.name,
        triggered_by: run.actor?.login || run.triggering_actor?.login || 'GitHub Actions',
        version_tag: run.head_branch || run.display_title || 'workflow run',
        commit_sha: run.head_sha,
        deploy_status: mapRunStatus(run),
        deployed_at: run.created_at || run.updated_at,
        workflow_url: run.html_url,
        event: run.event,
        run_number: run.run_number,
        repository,
        workflow_id: run.workflow_id,
    }));
};

export const getRepositoryWorkflows = async (configuredRepository, accessToken) => {
    const repository = getRepository(configuredRepository);
    const payload = await githubRequest(
        `${githubApiBaseUrl}/repos/${repository}/actions/workflows?per_page=100`, {}, accessToken
    );
    return (payload.workflows || []).map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        path: workflow.path,
        state: workflow.state,
    }));
};

export const getRepositoryRefs = async (configuredRepository, accessToken) => {
    const repository = getRepository(configuredRepository);
    const [branches, tags] = await Promise.all([
        githubRequest(`${githubApiBaseUrl}/repos/${repository}/branches?per_page=100`, {}, accessToken),
        githubRequest(`${githubApiBaseUrl}/repos/${repository}/tags?per_page=100`, {}, accessToken),
    ]);

    return {
        branches: branches.map((branch) => branch.name),
        tags: tags.map((tag) => tag.name),
    };
};

export const dispatchDeployment = async ({
                                             repository: configuredRepository,
                                             workflowId,
                                             ref,
                                             createTag = false,
                                             tagName,
                                             accessToken,
                                         }) => {
    const repository = getRepository(configuredRepository);
    let dispatchRef = ref;
    if (!workflowId || !/^\d+$/.test(String(workflowId))) {
        const error = new Error(
            'Select a valid GitHub Actions workflow for this project before triggering a deployment.',
        );
        error.status = 400;
        throw error;
    }

    if (createTag) {
        if (!tagName || !/^v?[0-9A-Za-z][0-9A-Za-z._/-]{0,29}$/.test(tagName)) {
            const error = new Error('Tag name must contain 1-30 letters, numbers, dots, underscores, or hyphens.');
            error.status = 400;
            throw error;
        }

        const source = await githubRequest(
            `${githubApiBaseUrl}/repos/${repository}/git/ref/heads/${encodeURIComponent(ref)}`, {}, accessToken
        );
        await githubRequest(`${githubApiBaseUrl}/repos/${repository}/git/refs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ref: `refs/tags/${tagName}`, sha: source.object.sha}),
        }, accessToken);
        dispatchRef = tagName;
    }

    await githubRequest(
        `${githubApiBaseUrl}/repos/${repository}/actions/workflows/${workflowId}/dispatches`,
        {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ref: dispatchRef}),
        }, accessToken
    );
    return {repository, ref: dispatchRef, tag_created: createTag};
};

export const cancelWorkflowRun = async (runId, configuredRepository, accessToken) => {
    const repository = getRepository(configuredRepository);
    if (!/^\d+$/.test(String(runId))) {
        const error = new Error('Workflow run id must be numeric.');
        error.status = 400;
        throw error;
    }

    await githubRequest(
        `${githubApiBaseUrl}/repos/${repository}/actions/runs/${runId}/cancel`,
        {method: 'POST'}, accessToken
    );
    return {id: Number(runId), cancelled: true};
};

export const rerunWorkflowRun = async (runId, configuredRepository, accessToken) => {
    const repository = getRepository(configuredRepository);
    if (!/^\d+$/.test(String(runId))) {
        const error = new Error('Workflow run id must be numeric.');
        error.status = 400;
        throw error;
    }

    await githubRequest(
        `${githubApiBaseUrl}/repos/${repository}/actions/runs/${runId}/rerun`,
        {method: 'POST'}, accessToken
    );
    return {id: Number(runId), rerun: true};
};
