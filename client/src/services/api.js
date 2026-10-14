const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const request = async (path, options = {}) => {
    const token = window.localStorage.getItem('accessToken');
    const headers = {
        Accept: 'application/json',
        ...(options.body ? {'Content-Type': 'application/json'} : {}),
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
        ...options.headers,
    };

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {...options, headers});
    } catch (error) {
        throw new Error('Unable to reach the backend API. Check the server connection.');
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.message || `Request failed with status ${response.status}.`);
    }

    return payload;
};

export async function getProjects() {
    return request('/api/projects');
}

export async function createProject(projectData) {
    return request('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
            name: projectData.name,
            repo_url: projectData.repo_url,
            environment: projectData.environment,
        }),
    });
}

export async function deleteProject(projectId) {
    return request(`/api/projects/${projectId}`, {method: 'DELETE'});
}

export async function getDeployments() {
    return request('/api/pipelines');
}

export async function getDeploymentRefs(projectId) {
    return request(`/api/pipelines/refs?project_id=${encodeURIComponent(projectId)}`);
}

export async function deleteDeployment(deploymentId) {
    return request(`/api/deployments/${deploymentId}`, {method: 'DELETE'});
}

export async function triggerDeployment(projectId, {versionTag, ref, createTag, tagName}) {
    return request('/api/deployments', {
        method: 'POST',
        body: JSON.stringify({
            project_id: projectId,
            version_tag: versionTag,
            ref,
            create_tag: createTag,
            tag_name: tagName,
        }),
    });
}

export async function getSystemHealth() {
    const health = await request('/api/health');
    return {
        status: health.status === 'ok' ? 'HEALTHY' : 'DEGRADED',
        uptime: health.uptime || '—',
        version: health.version || '1.0.0',
    };
}
