const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const PROJECTS_KEY = 'projects';
const DEPLOYMENTS_KEY = 'deployments';

const seedProjects = () => [
  {
    id: 1,
    user_id: 1,
    name: 'api-gateway',
    repo_url: 'https://github.com/acme/api-gateway',
    environment: 'production',
    created_at: '2025-05-17T09:30:00.000Z',
  },
  {
    id: 2,
    user_id: 1,
    name: 'frontend-portal',
    repo_url: 'https://github.com/acme/frontend-portal',
    environment: 'staging',
    created_at: '2025-05-20T10:45:00.000Z',
  },
  {
    id: 3,
    user_id: 1,
    name: 'metrics-worker',
    repo_url: 'https://github.com/acme/metrics-worker',
    environment: 'development',
    created_at: '2025-05-26T12:00:00.000Z',
  },
];

const seedDeployments = () => [
  {
    id: 1,
    project_id: 1,
    triggered_by: 'devops-bot',
    version_tag: 'v1.8.4',
    commit_sha: 'a1b2c3d4e5f6',
    deploy_status: 'SUCCESS',
    health_status: 'HEALTHY',
    deployed_at: '2025-06-09T14:22:00.000Z',
  },
  {
    id: 2,
    project_id: 2,
    triggered_by: 'jane.doe',
    version_tag: 'v1.9.0-rc2',
    commit_sha: '11dd88ee77aa',
    deploy_status: 'RUNNING',
    health_status: 'UNKNOWN',
    deployed_at: '2025-06-10T08:15:00.000Z',
  },
  {
    id: 3,
    project_id: 1,
    triggered_by: 'michael.s',
    version_tag: 'v1.8.5',
    commit_sha: 'ff22bb33ccaa',
    deploy_status: 'FAILED',
    health_status: 'UNHEALTHY',
    deployed_at: '2025-06-11T18:41:00.000Z',
  },
  {
    id: 4,
    project_id: 3,
    triggered_by: 'ops.team',
    version_tag: 'v0.4.7',
    commit_sha: '5af0def11234',
    deploy_status: 'SUCCESS',
    health_status: 'HEALTHY',
    deployed_at: '2025-06-12T06:30:00.000Z',
  },
];

const readFromStorage = (key, fallbackFactory) => {
  if (typeof window === 'undefined') {
    return fallbackFactory();
  }

  try {
    const existingValue = localStorage.getItem(key);
    if (!existingValue) {
      const fallback = fallbackFactory();
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }

    const parsed = JSON.parse(existingValue);
    return Array.isArray(parsed) ? parsed : fallbackFactory();
  } catch (error) {
    return fallbackFactory();
  }
};

const writeToStorage = (key, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
};

const isValidGithubUrl = (value) => /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/.*)?$/.test(value.trim());
const validEnvironments = ['production', 'staging', 'development'];

export async function getProjects() {
  await delay();

  try {
    const projects = readFromStorage(PROJECTS_KEY, seedProjects);
    return [...projects].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (error) {
    throw new Error('Unable to fetch projects. Displaying cached local data.');
  }
}

export async function createProject(projectData) {
  await delay();

  const name = String(projectData?.name || '').trim();
  const repoUrl = String(projectData?.repo_url || '').trim();
  const environment = String(projectData?.environment || '').trim();

  if (!name || name.length < 3) {
    throw new Error('Project name must be at least 3 characters long.');
  }

  if (!isValidGithubUrl(repoUrl)) {
    throw new Error('Repository URL must use the https://github.com/... format.');
  }

  if (!validEnvironments.includes(environment)) {
    throw new Error('Please select a valid environment.');
  }

  try {
    const projects = readFromStorage(PROJECTS_KEY, seedProjects);
    const newProject = {
      id: Date.now(),
      user_id: 1,
      name,
      repo_url: repoUrl,
      environment,
      created_at: new Date().toISOString(),
    };

    const nextProjects = [newProject, ...projects];
    writeToStorage(PROJECTS_KEY, nextProjects);
    return newProject;
  } catch (error) {
    throw new Error('Unable to save the project. Please try again.');
  }
}

export async function deleteProject(projectId) {
  await delay();

  try {
    const projects = readFromStorage(PROJECTS_KEY, seedProjects);
    const filteredProjects = projects.filter((project) => Number(project.id) !== Number(projectId));
    const deployments = readFromStorage(DEPLOYMENTS_KEY, seedDeployments);
    const filteredDeployments = deployments.filter((deployment) => Number(deployment.project_id) !== Number(projectId));

    writeToStorage(PROJECTS_KEY, filteredProjects);
    writeToStorage(DEPLOYMENTS_KEY, filteredDeployments);
    return { deleted: true };
  } catch (error) {
    throw new Error('Unable to delete the project. Please try again.');
  }
}

export async function getDeployments() {
  await delay();

  try {
    const deployments = readFromStorage(DEPLOYMENTS_KEY, seedDeployments);
    return [...deployments].sort((a, b) => new Date(b.deployed_at) - new Date(a.deployed_at));
  } catch (error) {
    throw new Error('Unable to fetch deployments. Displaying cached local data.');
  }
}

export async function triggerDeployment(projectId, versionTag) {
  await delay();

  try {
    const projects = readFromStorage(PROJECTS_KEY, seedProjects);
    const project = projects.find((item) => Number(item.id) === Number(projectId));

    if (!project) {
      throw new Error('Project not found.');
    }

    const rawTag = String(versionTag || `v${Date.now()}`).trim();
    const deployments = readFromStorage(DEPLOYMENTS_KEY, seedDeployments);
    const commitSha = `${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;

    const deployment = {
      id: Date.now(),
      project_id: Number(projectId),
      triggered_by: 'system-automation',
      version_tag: rawTag,
      commit_sha: commitSha,
      deploy_status: 'RUNNING',
      health_status: 'UNKNOWN',
      deployed_at: new Date().toISOString(),
    };

    const nextDeployments = [deployment, ...deployments];
    writeToStorage(DEPLOYMENTS_KEY, nextDeployments);
    return deployment;
  } catch (error) {
    throw new Error(error?.message || 'Unable to trigger deployment. Please try again.');
  }
}

export async function getSystemHealth() {
  await delay();

  try {
    const deployments = readFromStorage(DEPLOYMENTS_KEY, seedDeployments);
    const isDegraded = deployments.some(
      (deployment) => deployment.deploy_status === 'FAILED' || deployment.health_status === 'UNHEALTHY',
    );

    return {
      status: isDegraded ? 'DEGRADED' : 'HEALTHY',
      uptime: isDegraded ? '99.62%' : '99.98%',
      version: '1.0.0',
    };
  } catch (error) {
    throw new Error('Unable to fetch system health. Displaying cached local data.');
  }
}

export { seedProjects, seedDeployments };
