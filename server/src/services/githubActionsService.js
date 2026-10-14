const githubApiBaseUrl = 'https://api.github.com';

const getRepository = () => {
    const repository = process.env.GITHUB_REPOSITORY || 'zave52/professional-practice-in-software-engineering-project';
    if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
        const error = new Error('GITHUB_REPOSITORY must use the owner/repository format.');
        error.status = 500;
        throw error;
    }
    return repository;
};

const mapRunStatus = (run) => {
    if (run.status !== 'completed') {
        return 'RUNNING';
    }
    return run.conclusion === 'success' ? 'SUCCESS' : 'FAILED';
};

export const getWorkflowRuns = async () => {
    const repository = getRepository();
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };

    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(
        `${githubApiBaseUrl}/repos/${repository}/actions/runs?per_page=50`,
        {headers},
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
