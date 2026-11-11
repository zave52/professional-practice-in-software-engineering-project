import {describe, expect, it} from 'vitest';
import {filterDeployments, summarize} from '../src/models/deployments';
import {validateProjectForm} from '../src/models/projectForm';
import {formatDate, formatDuration, formatMetric, formatMinutes, humanizeEvent, shortSha} from '../src/utils/format';

const deployments = [
    {id: 1, project_id: 1, version_tag: 'main', commit_sha: 'abc123', triggered_by: 'alice', deploy_status: 'SUCCESS', duration_seconds: 60},
    {id: 2, project_id: 2, version_tag: 'v2.0', commit_sha: 'def456', triggered_by: 'bob', deploy_status: 'FAILED', duration_seconds: 120},
    {id: 3, project_id: 2, version_tag: 'develop', commit_sha: null, triggered_by: 'bob', deploy_status: 'RUNNING', duration_seconds: null},
    {id: 4, project_id: 1, version_tag: 'main', commit_sha: 'aaa', triggered_by: 'alice', deploy_status: 'CANCELING', duration_seconds: null},
];

describe('deployment model', () => {
    it('filters by text in ref, commit or author and by project', () => {
        expect(filterDeployments(deployments, {searchTerm: 'V2', projectFilter: 'all'}).map((item) => item.id)).toEqual([2]);
        expect(filterDeployments(deployments, {searchTerm: 'def', projectFilter: 'all'}).map((item) => item.id)).toEqual([2]);
        expect(filterDeployments(deployments, {searchTerm: 'bob', projectFilter: '2'}).map((item) => item.id)).toEqual([2, 3]);
        expect(filterDeployments(deployments, {searchTerm: ' ', projectFilter: '1'}).map((item) => item.id)).toEqual([1, 4]);
    });

    it('summarises the dashboard numbers', () => {
        expect(summarize([{}, {}], deployments)).toEqual({
            projects: 2, active: 2, total: 4, successRate: 50, completed: 2, averageDuration: 90,
        });
        expect(summarize([], [])).toMatchObject({successRate: null, averageDuration: null});
    });

    it('validates the project form like the server does', () => {
        expect(validateProjectForm({name: 'ab', repoUrl: 'x', workflowId: ''})).toEqual({
            name: 'Project name must be between 3 and 100 characters long.',
            repo_url: 'Repository URL must follow the https://github.com/owner/repository format.',
            workflow: 'Select a GitHub Actions workflow.',
        });
        expect(validateProjectForm({name: 'App', repoUrl: 'https://github.com/a/b.git', workflowId: '1'})).toEqual({});
    });
});

describe('formatters', () => {
    it('formats durations, minutes and metrics', () => {
        expect(formatDuration(null)).toBe('—');
        expect(formatDuration(42)).toBe('42s');
        expect(formatDuration(120)).toBe('2m');
        expect(formatDuration(135)).toBe('2m 15s');
        expect(formatMinutes(undefined)).toBe('—');
        expect(formatMinutes(12.34)).toBe('12.3 min');
        expect(formatMinutes(90)).toBe('1.5 h');
        expect(formatMinutes(2880)).toBe('2 d');
        expect(formatMetric(null)).toBe('—');
        expect(formatMetric({value: 15, unit: 'minutes'})).toBe('15 min');
        expect(formatMetric({value: 12.5, unit: '%'})).toBe('12.5%');
        expect(formatMetric({value: 1.4, unit: 'per day'})).toBe('1.4 per day');
    });

    it('formats dates, events and SHAs', () => {
        expect(formatDate(null)).toBe('—');
        expect(formatDate('2026-11-01T10:00:00Z')).toMatch(/Nov 1/);
        expect(humanizeEvent('DEPLOYMENT_STATUS_CHANGED')).toBe('Deployment status changed');
        expect(shortSha('0123456789abcdef')).toBe('01234567');
        expect(shortSha(null)).toBe('—');
    });
});
