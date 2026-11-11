export const REPOSITORY_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(?:\.git)?\/?$/;
export const validateProjectForm = ({name, repoUrl, workflowId}) => {
    const errors = {};
    if (name.trim().length < 3 || name.trim().length > 100) {
        errors.name = 'Project name must be between 3 and 100 characters long.';
    }
    if (!REPOSITORY_URL.test(repoUrl.trim())) {
        errors.repo_url = 'Repository URL must follow the https://github.com/owner/repository format.';
    }
    if (!workflowId) {
        errors.workflow = 'Select a GitHub Actions workflow.';
    }
    return errors;
};
