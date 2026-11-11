const GITHUB_REPOSITORY_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

/** Returns `owner/name` for a canonical GitHub repository URL or null. */
export const parseRepositoryUrl = (url) => {
    const match = GITHUB_REPOSITORY_URL.exec(String(url || '').trim());
    return match ? `${match[1]}/${match[2]}` : null;
};

export const toRepositoryUrl = (repository) => `https://github.com/${repository}`;

/** `owner/name` of a stored project; projects always store a canonical URL. */
export const projectRepository = (project) => parseRepositoryUrl(project.repo_url);
