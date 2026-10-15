const API_BASE_URL = import.meta.env.VITE_API_URL || '';

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
        throw new Error('Не вдалося підключитися до сервера. Перевірте з’єднання.');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        if (response.status === 401) throw new Error('Будь ласка, увійдіть через GitHub, щоб виконати цю дію.');
        throw new Error(payload?.message || 'Не вдалося виконати запит. Перевірте з’єднання з сервером.');
    }
    return payload;
};

export const getSession = () => request('/api/auth/session');
export const logout = () => request('/api/auth/logout', {method: 'POST'});
export const getLoginUrl = () => `${API_BASE_URL}/api/auth/github`;
export const getProjects = () => request('/api/projects');
export const getRepositoryWorkflows = (repoUrl) =>
    request(`/api/pipelines/workflows?repo_url=${encodeURIComponent(repoUrl)}`);
export const createProject = (projectData) => request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
        name: projectData.name, repo_url: projectData.repo_url,
        workflow_id: projectData.workflow_id, workflow_name: projectData.workflow_name
    }),
});
export const deleteProject = (projectId) => request(`/api/projects/${projectId}`, {method: 'DELETE'});
export const getDeployments = () => request('/api/pipelines');
export const getDeploymentRefs = (projectId) => request(`/api/pipelines/refs?project_id=${encodeURIComponent(projectId)}`);
export const deleteDeployment = (deploymentId, projectId) => request(`/api/deployments/${deploymentId}`, {
    method: 'DELETE', body: JSON.stringify({project_id: projectId}),
});
export const rerunDeployment = (deploymentId, projectId) => request(`/api/deployments/${deploymentId}/rerun`, {
    method: 'POST', body: JSON.stringify({project_id: projectId}),
});
export const triggerDeployment = (projectId, {versionTag, ref, createTag, tagName}) => request('/api/deployments', {
    method: 'POST', body: JSON.stringify({
        project_id: projectId, version_tag: versionTag, ref,
        create_tag: createTag, tag_name: tagName
    }),
});
