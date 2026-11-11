import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import App from '../src/App';
import AddProjectModal from '../src/components/AddProjectModal';
import AuditLog from '../src/components/AuditLog';
import ConfirmModal from '../src/components/ConfirmModal';
import DeploymentTable from '../src/components/DeploymentTable';
import LoginPage from '../src/components/LoginPage';
import MetricsPanel from '../src/components/MetricsPanel';
import Navbar from '../src/components/Navbar';
import ProjectList from '../src/components/ProjectList';
import StatsCards from '../src/components/StatsCards';
import TriggerDeployModal from '../src/components/TriggerDeployModal';
import * as api from '../src/services/api';

vi.mock('../src/services/api', () => ({
    getSession: vi.fn(),
    logout: vi.fn(),
    getLoginUrl: vi.fn(() => '/api/auth/github'),
    getProjects: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    getDeployments: vi.fn(),
    getDeploymentRefs: vi.fn(),
    getRepositoryWorkflows: vi.fn(),
    triggerDeployment: vi.fn(),
    cancelDeployment: vi.fn(),
    rerunDeployment: vi.fn(),
    getMetrics: vi.fn(),
    getAuditLog: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const project = {id: 1, name: 'Dashboard', repo_url: 'https://github.com/acme/dashboard', workflow_id: 42,
    workflow_name: 'Deploy', owner_username: 'dev'};
const deployments = [
    {id: 1, project_id: 1, project_name: 'Dashboard', run_id: 11, run_number: 7, workflow_name: 'Deploy',
        workflow_url: 'https://github.com/x', version_tag: 'v1.0', commit_sha: 'abcdef1234567890', triggered_by: 'ci',
        deploy_status: 'SUCCESS', started_at: '2026-11-01T10:00:00Z', duration_seconds: 95, actions: ['rerun']},
    {id: 2, project_id: 1, run_id: 12, version_tag: 'v2.0', commit_sha: '1234567890abcdef', triggered_by: 'dev',
        deploy_status: 'RUNNING', started_at: '2026-11-01T11:00:00Z', duration_seconds: null, actions: ['cancel']},
    {id: 3, project_id: 1, run_id: null, version_tag: 'main', commit_sha: null, triggered_by: 'dev', pending: true,
        deploy_status: 'RUNNING', started_at: '2026-11-01T12:00:00Z', actions: []},
];

describe('AddProjectModal', () => {
    it('validates the form before submitting', () => {
        const onSubmit = vi.fn();
        render(<AddProjectModal onClose={vi.fn()} onSubmit={onSubmit}/>);
        fireEvent.click(screen.getByRole('button', {name: 'Save project'}));
        expect(screen.getByText('Project name must be between 3 and 100 characters long.')).toBeInTheDocument();
        expect(screen.getByText(/Repository URL must follow/)).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('loads workflows for a valid repository and submits the selection', async () => {
        api.getRepositoryWorkflows.mockResolvedValue([
            {id: 10, name: 'Deploy', path: '.github/workflows/deploy.yml'},
            {id: 11, name: 'CI', path: '.github/workflows/ci.yml'},
        ]);
        const onSubmit = vi.fn();
        render(<AddProjectModal onClose={vi.fn()} onSubmit={onSubmit}/>);

        fireEvent.change(screen.getByLabelText('Project name'), {target: {value: '  api '}});
        fireEvent.change(screen.getByLabelText('Repository URL'), {target: {value: ' https://github.com/acme/project '}});
        expect(await screen.findByRole('option', {name: /CI/})).toBeInTheDocument();
        expect(api.getRepositoryWorkflows).toHaveBeenCalledWith('https://github.com/acme/project');

        fireEvent.change(screen.getByLabelText('GitHub Actions workflow'), {target: {value: '11'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save project'}));
        expect(onSubmit).toHaveBeenCalledWith({name: 'api', repo_url: 'https://github.com/acme/project', workflow_id: 11});
    });

    it('shows workflow lookup errors', async () => {
        api.getRepositoryWorkflows.mockRejectedValue(new Error('GitHub repository was not found.'));
        render(<AddProjectModal onClose={vi.fn()} onSubmit={vi.fn()}/>);
        fireEvent.change(screen.getByLabelText('Repository URL'), {target: {value: 'https://github.com/acme/missing'}});
        expect(await screen.findByText('GitHub repository was not found.')).toBeInTheDocument();
    });
});

describe('TriggerDeployModal', () => {
    it('offers branches, creates tags and submits the selected ref', async () => {
        api.getDeploymentRefs.mockResolvedValue({branches: ['main', 'develop'], tags: ['v1.0.0']});
        const onSubmit = vi.fn().mockResolvedValue();
        render(<TriggerDeployModal project={project} onClose={vi.fn()} onSubmit={onSubmit}/>);

        expect(await screen.findByRole('option', {name: 'develop'})).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Branch'), {target: {value: 'develop'}});
        fireEvent.click(screen.getByLabelText(/Create a new tag/));
        fireEvent.change(screen.getByLabelText(/New tag name/), {target: {value: 'bad tag'}});
        expect(screen.getByRole('button', {name: 'Start deployment'})).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/New tag name/), {target: {value: 'v2.0.0'}});
        fireEvent.click(screen.getByRole('button', {name: 'Start deployment'}));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ref: 'develop', createTag: true, tagName: 'v2.0.0'}));
    });

    it('switches to existing tags and shows load errors', async () => {
        api.getDeploymentRefs.mockResolvedValueOnce({branches: ['main'], tags: []});
        const {unmount} = render(<TriggerDeployModal project={project} error="Boom" onClose={vi.fn()} onSubmit={vi.fn()}/>);
        await screen.findByRole('option', {name: 'main'});
        expect(screen.getByRole('alert')).toHaveTextContent('Boom');
        fireEvent.change(screen.getByLabelText('Source type'), {target: {value: 'tag'}});
        expect(screen.getByText('No tags are available in this repository.')).toBeInTheDocument();
        unmount();

        api.getDeploymentRefs.mockRejectedValueOnce(new Error('No access'));
        render(<TriggerDeployModal project={project} onClose={vi.fn()} onSubmit={vi.fn()}/>);
        expect(await screen.findByText('No access')).toBeInTheDocument();
    });
});

describe('DeploymentTable', () => {
    const renderTable = (props = {}) => render(
        <DeploymentTable deployments={deployments} projects={[project]} isLoading={false} searchTerm="" setSearchTerm={vi.fn()}
                         projectFilter="all" setProjectFilter={vi.fn()} onCancelDeployment={vi.fn()} onRerunDeployment={vi.fn()}
                         {...props}/>,
    );

    it('renders actions provided by the server state machine', () => {
        const onCancel = vi.fn();
        const onRerun = vi.fn();
        renderTable({onCancelDeployment: onCancel, onRerunDeployment: onRerun});
        const rows = screen.getAllByRole('row').slice(1);

        expect(within(rows[0]).getByRole('link', {name: /Deploy #7/})).toHaveAttribute('href', 'https://github.com/x');
        expect(within(rows[0]).getByText('1m 35s')).toBeInTheDocument();
        fireEvent.click(within(rows[0]).getByRole('button', {name: /Rerun/}));
        fireEvent.click(within(rows[1]).getByRole('button', {name: /Cancel/}));
        expect(within(rows[2]).getByText('QUEUED')).toBeInTheDocument();
        expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument();
        expect(onRerun).toHaveBeenCalledWith(deployments[0]);
        expect(onCancel).toHaveBeenCalledWith(deployments[1]);
    });

    it('filters, shows sync warnings, copies SHAs and handles empty and loading states', async () => {
        const writeText = vi.fn().mockResolvedValue();
        Object.assign(navigator, {clipboard: {writeText}});
        const setSearchTerm = vi.fn();
        renderTable({searchTerm: 'v2', setSearchTerm, warnings: [{project_id: 1, project_name: 'Dashboard', message: 'GitHub API returned 500.'}]});
        expect(screen.queryByText('v1.0')).not.toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('GitHub API returned 500.');
        fireEvent.change(screen.getByLabelText('Search deployments'), {target: {value: 'x'}});
        expect(setSearchTerm).toHaveBeenCalledWith('x');
        fireEvent.click(screen.getByRole('button', {name: 'Copy commit SHA'}));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('1234567890abcdef'));

        renderTable({searchTerm: 'nothing'});
        expect(screen.getByText('No deployments match the current filters.')).toBeInTheDocument();
        renderTable({isLoading: true});
        expect(screen.getByText('Loading deployments...')).toBeInTheDocument();
    });
});

describe('presentational components', () => {
    it('ProjectList shows owners for admins and disables deploys without a workflow', () => {
        const onTrigger = vi.fn();
        const onDelete = vi.fn();
        render(<ProjectList projects={[project, {...project, id: 2, name: 'Legacy', workflow_id: 0}]} onTriggerDeploy={onTrigger}
                            onDeleteProject={onDelete} isLoading={false} showOwner/>);
        expect(screen.getAllByText('dev')).toHaveLength(2);
        const [first, second] = screen.getAllByRole('article');
        fireEvent.click(within(first).getByRole('button', {name: /Trigger Deploy/}));
        fireEvent.click(within(first).getByRole('button', {name: /Delete/}));
        expect(within(second).getByRole('button', {name: /Trigger Deploy/})).toBeDisabled();
        expect(within(second).getByText('Not configured')).toBeInTheDocument();
        expect(onTrigger).toHaveBeenCalledWith(project);
        expect(onDelete).toHaveBeenCalledWith(project);
    });

    it('ProjectList shows empty and loading states', () => {
        const {rerender, container} = render(<ProjectList projects={[]} isLoading={false}/>);
        expect(screen.getByText(/No projects yet/)).toBeInTheDocument();
        rerender(<ProjectList projects={[]} isLoading/>);
        expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('StatsCards summarises runs', () => {
        render(<StatsCards projects={[project]} deployments={deployments} isLoading={false}/>);
        expect(screen.getByText('100.0%')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('1m 35s')).toBeInTheDocument();
    });

    it('MetricsPanel renders DORA metrics with levels and switches periods', () => {
        const onDaysChange = vi.fn();
        const metrics = {
            period: {days: 30},
            totals: {total: 5, success: 3, failed: 1, canceled: 1},
            metrics: {
                deploymentFrequency: {label: 'Deployment frequency', value: 0.5, unit: 'per day', level: 'high', sampleSize: 3},
                leadTimeForChanges: {label: 'Lead time for changes', value: 90, unit: 'minutes', level: 'elite', sampleSize: 3},
                changeFailureRate: {label: 'Change failure rate', value: 25, unit: '%', level: 'low', sampleSize: 4},
                timeToRestore: {label: 'Time to restore service', value: null, unit: 'minutes', level: 'n/a', sampleSize: 0},
                pipelineDuration: {label: 'Pipeline duration', value: 2.5, unit: 'minutes', level: 'elite', sampleSize: 4},
            },
        };
        render(<MetricsPanel metrics={metrics} days={30} onDaysChange={onDaysChange} error=""/>);
        expect(screen.getByText('1.5 h')).toBeInTheDocument();
        expect(screen.getByText('25%')).toBeInTheDocument();
        expect(within(screen.getByLabelText('Change failure rate')).getByText('low')).toBeInTheDocument();
        expect(screen.getByText(/5 deployment runs in the last 30 days/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: '7 days'}));
        expect(onDaysChange).toHaveBeenCalledWith(7);
    });

    it('MetricsPanel shows loading and error states', () => {
        const {container, rerender} = render(<MetricsPanel metrics={null} days={30} onDaysChange={vi.fn()} error=""/>);
        expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
        rerender(<MetricsPanel metrics={null} days={30} onDaysChange={vi.fn()} error="Unable to load metrics."/>);
        expect(screen.getByRole('alert')).toHaveTextContent('Unable to load metrics.');
    });

    it('AuditLog describes events', () => {
        const onRefresh = vi.fn();
        const {rerender} = render(<AuditLog entries={null} onRefresh={onRefresh}/>);
        expect(screen.getByText('Loading activity...')).toBeInTheDocument();
        rerender(<AuditLog entries={[]} onRefresh={onRefresh}/>);
        expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument();
        rerender(<AuditLog onRefresh={onRefresh} entries={[
            {id: 1, event: 'DEPLOYMENT_STATUS_CHANGED', username: null, project_name: 'Dashboard', payload: {from: 'RUNNING', to: 'FAILED'}},
            {id: 2, event: 'ACTION_FAILED', username: 'dev', payload: {command: 'CancelDeployment', reason: 'Busy'}},
            {id: 3, event: 'DEPLOYMENT_TRIGGERED', username: 'dev', payload: {ref: 'v1', tagCreated: true}},
            {id: 4, event: 'PROJECT_DELETED', username: 'dev', payload: {name: 'Old'}},
        ]}/>);
        expect(screen.getByText('RUNNING → FAILED')).toBeInTheDocument();
        expect(screen.getByText('system')).toBeInTheDocument();
        expect(screen.getByText('CancelDeployment: Busy')).toBeInTheDocument();
        expect(screen.getByText('ref v1 (tag created)')).toBeInTheDocument();
        expect(screen.getByText('Old')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: /Refresh/}));
        expect(onRefresh).toHaveBeenCalled();
    });

    it('ConfirmModal adapts its text to the pending action', () => {
        const onConfirm = vi.fn();
        const {rerender} = render(<ConfirmModal action={null} onClose={vi.fn()} onConfirm={onConfirm}/>);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        rerender(<ConfirmModal action={{type: 'delete-project', project}} onClose={vi.fn()} onConfirm={onConfirm}/>);
        expect(screen.getByText(/Delete "Dashboard"/)).toBeInTheDocument();
        rerender(<ConfirmModal action={{type: 'cancel-deployment', deployment: deployments[1]}} onClose={vi.fn()} onConfirm={onConfirm}/>);
        fireEvent.click(screen.getByRole('button', {name: 'Cancel run'}));
        expect(onConfirm).toHaveBeenCalled();
    });

    it('LoginPage explains login errors', () => {
        const onLogin = vi.fn();
        const {rerender} = render(<LoginPage onLogin={onLogin} error="FORBIDDEN"/>);
        expect(screen.getByRole('alert')).toHaveTextContent('deactivated');
        rerender(<LoginPage onLogin={onLogin} error="SOMETHING"/>);
        expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed');
        fireEvent.click(screen.getByRole('button', {name: /Sign in via GitHub/}));
        expect(onLogin).toHaveBeenCalled();
    });

    it('Navbar switches tabs and shows the role', () => {
        const onTabChange = vi.fn();
        const onAddProject = vi.fn();
        render(<Navbar activeTab="dashboard" onTabChange={onTabChange} onAddProject={onAddProject}
                       user={{username: 'boss', role: 'Admin', avatar_url: 'https://avatar'}} onLogout={vi.fn()}/>);
        expect(screen.getByText('Admin')).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', {name: 'Metrics'})[0]);
        expect(onTabChange).toHaveBeenCalledWith('metrics');
        fireEvent.click(screen.getByRole('button', {name: 'Toggle navigation'}));
        const activityButtons = screen.getAllByRole('button', {name: 'Activity'});
        fireEvent.click(activityButtons[activityButtons.length - 1]);
        expect(onTabChange).toHaveBeenLastCalledWith('activity');
        fireEvent.click(screen.getByRole('button', {name: 'Toggle navigation'}));
        const newButtons = screen.getAllByRole('button', {name: /New Project/});
        fireEvent.click(newButtons[newButtons.length - 1]);
        expect(onAddProject).toHaveBeenCalled();
    });
});

describe('App (View bound to the ViewModel)', () => {
    beforeEach(() => {
        api.getProjects.mockResolvedValue([project]);
        api.getDeployments.mockResolvedValue({deployments, warnings: [], synced_at: '2026-11-01T12:00:00Z'});
        api.getMetrics.mockResolvedValue({period: {days: 30}, totals: {total: 0}, metrics: {}});
        api.getAuditLog.mockResolvedValue([]);
        api.getDeploymentRefs.mockResolvedValue({branches: ['main'], tags: []});
    });

    it('shows the login page for anonymous visitors', async () => {
        api.getSession.mockResolvedValue({user: null});
        render(<App/>);
        expect(await screen.findByRole('button', {name: /Sign in via GitHub/})).toBeInTheDocument();
    });

    it('renders the dashboard and navigates between views', async () => {
        api.getSession.mockResolvedValue({user: {id: 1, username: 'dev', role: 'Developer'}});
        render(<App/>);
        expect(await screen.findByText('Pipeline health')).toBeInTheDocument();
        expect(await screen.findByRole('link', {name: /Deploy #7/})).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', {name: 'Projects'})[0]);
        expect(screen.getByText('Project catalog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Add project'}));
        expect(screen.getByRole('dialog', {name: 'Add project'})).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));

        fireEvent.click(screen.getByRole('button', {name: /Trigger Deploy/}));
        expect(await screen.findByRole('dialog', {name: 'Trigger deployment'})).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));

        fireEvent.click(screen.getByRole('button', {name: /Delete/}));
        expect(screen.getByRole('dialog', {name: 'Delete project'})).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Keep'}));

        fireEvent.click(screen.getAllByRole('button', {name: 'Deployments'})[0]);
        expect(screen.getByLabelText('Search deployments')).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', {name: 'Metrics'})[0]);
        expect(await screen.findByText('Delivery performance')).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', {name: 'Activity'})[0]);
        expect(await screen.findByText('No activity recorded yet.')).toBeInTheDocument();
    });
});
