const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
    constructor(message, {status, code} = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

const query = (params = {}) => {
    const search = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'all'),
    ).toString();
    return search ? `?${search}` : '';
};

const request = async (path, options = {}) => {
    const headers = {
        Accept: 'application/json',
        ...(options.body ? {'Content-Type': 'application/json'} : {}),
        ...options.headers,
    };
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {...options, headers, credentials: 'include'});
    } catch {
        throw new ApiError('Unable to connect to the server. Check your connection.', {status: 0, code: 'NETWORK_ERROR'});
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        if (response.status === 401) {
            throw new ApiError(payload?.message || 'Please sign in with GitHub to perform this action.', {
                status: 401,
                code: 'UNAUTHENTICATED',
            });
        }
        throw new ApiError(payload?.message || 'Unable to complete the request. Check your connection.', {
            status: response.status,
            code: payload?.code,
        });
    }
    return payload;
};

const post = (path, body) => request(path, {method: 'POST', ...(body ? {body: JSON.stringify(body)} : {})});

export const getSession = () => request('/api/auth/session');
export const logout = () => post('/api/auth/logout');
export const getLoginUrl = () => `${API_BASE_URL}/api/auth/github`;

export const getProjects = () => request('/api/projects');
export const createProject = ({name, repo_url, workflow_id}) => post('/api/projects', {name, repo_url, workflow_id});
export const deleteProject = (projectId) => request(`/api/projects/${projectId}`, {method: 'DELETE'});
export const getDeploymentRefs = (projectId) => request(`/api/projects/${projectId}/refs`);
export const getRepositoryWorkflows = (repoUrl) => request(`/api/repositories/workflows${query({repo_url: repoUrl})}`);

export const getDeployments = ({projectId} = {}) => request(`/api/deployments${query({project_id: projectId})}`);
export const triggerDeployment = (projectId, {ref, createTag, tagName}) => post('/api/deployments', {
    project_id: projectId,
    ref,
    create_tag: createTag,
    tag_name: tagName,
});
export const cancelDeployment = (deploymentId) => post(`/api/deployments/${deploymentId}/cancel`);
export const rerunDeployment = (deploymentId) => post(`/api/deployments/${deploymentId}/rerun`);

export const getMetrics = ({days, projectId} = {}) => request(`/api/metrics${query({days, project_id: projectId})}`);
export const getAuditLog = ({limit} = {}) => request(`/api/audit${query({limit})}`);
