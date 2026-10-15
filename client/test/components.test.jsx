import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import AddProjectModal from '../src/components/AddProjectModal';
import DeploymentTable from '../src/components/DeploymentTable';
import ProjectList from '../src/components/ProjectList';
import * as api from '../src/services/api';

vi.mock('../src/services/api', () => ({getRepositoryWorkflows: vi.fn()}));

describe('AddProjectModal', () => {
    afterEach(() => vi.clearAllMocks());

    it('shows validation errors and does not submit incomplete projects', () => {
        const onSubmit = vi.fn();
        render(<AddProjectModal isOpen onClose={vi.fn()} onSubmit={onSubmit}/>);

        fireEvent.submit(screen.getByRole('button', {name: 'Save project'}));

        expect(screen.getByText('Project name must be at least 3 characters long.')).toBeInTheDocument();
        expect(screen.getByText('Repository URL must follow the https://github.com/... format.')).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('loads workflows after a valid repository and submits normalized data', async () => {
        api.getRepositoryWorkflows.mockResolvedValue([
            {id: 10, name: 'Deploy', path: '.github/workflows/deploy.yml'},
        ]);
        const onSubmit = vi.fn();
        render(<AddProjectModal isOpen onClose={vi.fn()} onSubmit={onSubmit}/>);

        fireEvent.change(screen.getByPlaceholderText('api-gateway'), {target: {value: '  api '}});
        fireEvent.change(screen.getByPlaceholderText('https://github.com/acme/project-name'), {
            target: {value: ' https://github.com/acme/project '},
        });
        await waitFor(() => expect(api.getRepositoryWorkflows).toHaveBeenCalledWith('https://github.com/acme/project'));
        expect(screen.getByRole('option', {name: /Deploy/})).toBeInTheDocument();

        fireEvent.submit(screen.getByRole('button', {name: 'Save project'}));
        expect(onSubmit).toHaveBeenCalledWith({
            name: 'api',
            repo_url: 'https://github.com/acme/project',
            workflow_id: 10,
            workflow_name: 'Deploy',
        });
    });
});

describe('ProjectList', () => {
    const project = {
        id: 1,
        name: 'Dashboard',
        repo_url: 'https://github.com/acme/dashboard',
        workflow_name: 'Deploy',
    };

    it('renders project details and invokes project actions', () => {
        const onTriggerDeploy = vi.fn();
        const onDeleteProject = vi.fn();
        render(<ProjectList projects={[project]} onTriggerDeploy={onTriggerDeploy}
                            onDeleteProject={onDeleteProject} isLoading={false}/>);

        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Deploy')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: /Trigger Deploy/}));
        fireEvent.click(screen.getByRole('button', {name: /Delete/}));
        expect(onTriggerDeploy).toHaveBeenCalledWith(project);
        expect(onDeleteProject).toHaveBeenCalledWith(project);
    });
});

describe('DeploymentTable', () => {
    const deployments = [
        {
            id: 1,
            project_id: 1,
            version_tag: 'v1.0',
            commit_sha: 'abcdef1234567890',
            triggered_by: 'ci',
            deploy_status: 'SUCCESS',
            deployed_at: '2025-01-01'
        },
        {
            id: 2,
            project_id: 2,
            version_tag: 'v2.0',
            commit_sha: '1234567890abcdef',
            triggered_by: 'ci',
            deploy_status: 'RUNNING',
            deployed_at: '2025-01-02'
        },
    ];
    const projects = [{id: 1, name: 'One'}, {id: 2, name: 'Two'}];

    it('filters deployments and renders status-specific actions', () => {
        const setSearchTerm = vi.fn();
        const setProjectFilter = vi.fn();
        const cancel = vi.fn();
        const rerun = vi.fn();
        render(<DeploymentTable deployments={deployments} projects={projects} isLoading={false}
                                searchTerm="v1" setSearchTerm={setSearchTerm} projectFilter="all"
                                setProjectFilter={setProjectFilter} onCancelDeployment={cancel}
                                onRerunDeployment={rerun}/>);

        expect(screen.getByText('v1.0')).toBeInTheDocument();
        expect(screen.queryByText('v2.0')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Rerun/})).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('Search by version or commit'), {target: {value: 'v2'}});
        expect(setSearchTerm).toHaveBeenCalledWith('v2');
    });

    it('shows cancel action for running deployments', () => {
        render(<DeploymentTable deployments={[deployments[1]]} projects={projects} isLoading={false}
                                searchTerm="" setSearchTerm={vi.fn()} projectFilter="all"
                                setProjectFilter={vi.fn()} onCancelDeployment={vi.fn()}
                                onRerunDeployment={vi.fn()}/>);
        expect(screen.getByRole('button', {name: /Cancel/})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: /Rerun/})).not.toBeInTheDocument();
    });
});
