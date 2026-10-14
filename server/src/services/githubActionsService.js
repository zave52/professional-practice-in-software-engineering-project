const githubApiBaseUrl = 'https://api.github.com';

const getRepository = () => {
    const repository = process.env.GITHUB_REPOSITORY
        || 'zave52/professional-practice-in-software-engineering-project';
    if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
        const error = new Error('GITHUB_REPOSITORY must use the owner/repository format.');
        error.status = 500;
        throw error;
    }
    return repository;
};

const getHeaders = () => {
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
};

const githubRequest = async (url, options = {}) => {
    const response = await fetch(url, {
        ...options,
        headers: {...getHeaders(), ...options.headers},
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
    return response.status === 204 ? null : response.json();
};

const mapRunStatus = (run) => {
    if (run.status !== 'completed') {
        return 'RUNNING';
    }
    return run.conclusion === 'success' ? 'SUCCESS' : 'FAILED';
};

export const getWorkflowRuns = async () => {
    const repository = getRepository();
    const response = await fetch(
        `${githubApiBaseUrl}/repos/${repository}/actions/runs?per_page=50`,
        {headers: getHeaders()},
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
        health_status:
            run.status === 'completed' && run.conclusion === 'success'
                ? 'HEALTHY'
                : run.status === 'completed'
                    ? 'UNHEALTHY'
                    : 'UNKNOWN',
        deployed_at: run.updated_at || run.created_at,
        workflow_url: run.html_url,
        event: run.event,
        run_number: run.run_number,
    }));
};

export const dispatchDeployment = async ({ref, createTag = false, tagName}) => {
    const repository = getRepository();
    let dispatchRef = ref;

    if (createTag) {
        if (!tagName || !/^v?[0-9A-Za-z][0-9A-Za-z._/-]{0,29}$/.test(tagName)) {
            const error = new Error('Tag name must contain 1-30 letters, numbers, dots, underscores, or hyphens.');
            error.status = 400;
            throw error;
        }

        const source = await githubRequest(
            `${githubApiBaseUrl}/repos/${repository}/git/ref/heads/${encodeURIComponent(ref)}`,
        );
        await githubRequest(`${githubApiBaseUrl}/repos/${repository}/git/refs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ref: `refs/tags/${tagName}`, sha: source.object.sha}),
        });
        dispatchRef = tagName;
    }

    await githubRequest(
        `${githubApiBaseUrl}/repos/${repository}/actions/workflows/deploy.yml/dispatches`,
        {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ref: dispatchRef}),
        },
    );

    return {repository, ref: dispatchRef, tag_created: createTag};
};
