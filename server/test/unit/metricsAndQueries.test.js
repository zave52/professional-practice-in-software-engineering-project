import {describe, expect, it} from 'vitest';
import {DeploymentQueryBuilder} from '../../src/patterns/builder/DeploymentQueryBuilder.js';
import {MetricsCalculator, createDoraMetricsCalculator} from '../../src/patterns/strategy/metrics/MetricsCalculator.js';
import {median, MetricStrategy} from '../../src/patterns/strategy/metrics/MetricStrategy.js';
import {
    ChangeFailureRateStrategy,
    DeploymentFrequencyStrategy,
    LeadTimeForChangesStrategy,
    PipelineDurationStrategy,
    TimeToRestoreStrategy,
} from '../../src/patterns/strategy/metrics/strategies.js';

const at = (minutes) => new Date(Date.UTC(2026, 10, 1, 0, minutes)).toISOString();
const deployment = (status, {project = 1, commit = 0, start = 10, finish = 12} = {}) => ({
    project_id: project,
    deploy_status: status,
    commit_at: at(commit),
    started_at: at(start),
    finished_at: status === 'RUNNING' ? null : at(finish),
});

describe('Strategy pattern: DORA metrics', () => {
    it('computes medians', () => {
        expect(median([])).toBeNull();
        expect(median([5, 1, 3])).toBe(3);
        expect(median([4, 1, 3, 2])).toBe(2.5);
    });

    it('deployment frequency counts successful deployments per day', () => {
        const strategy = new DeploymentFrequencyStrategy();
        const items = Array.from({length: 14}, () => deployment('SUCCESS')).concat(deployment('FAILED'));
        expect(strategy.calculate(items, {days: 7})).toMatchObject({value: 2, perWeek: 14, level: 'elite', sampleSize: 14});
        expect(strategy.calculate(items.slice(0, 2), {days: 7}).level).toBe('high');
        expect(strategy.calculate(items.slice(0, 1), {days: 30}).level).toBe('medium');
        expect(strategy.calculate(items.slice(0, 1), {days: 90}).level).toBe('low');
        expect(strategy.calculate([], {days: 30})).toMatchObject({value: 0, level: 'n/a'});
    });

    it('lead time is the median commit-to-production time of successful deployments', () => {
        const strategy = new LeadTimeForChangesStrategy();
        const result = strategy.calculate([
            deployment('SUCCESS', {commit: 0, finish: 10}),
            deployment('SUCCESS', {commit: 0, finish: 30}),
            deployment('SUCCESS', {commit: 0, finish: 20}),
            deployment('FAILED', {commit: 0, finish: 999}),
        ]);
        expect(result).toMatchObject({value: 20, unit: 'minutes', level: 'elite', sampleSize: 3});
        expect(strategy.calculate([deployment('SUCCESS', {commit: 0, finish: 3 * 24 * 60})]).level).toBe('high');
        expect(strategy.calculate([deployment('SUCCESS', {commit: 0, finish: 10 * 24 * 60})]).level).toBe('medium');
        expect(strategy.calculate([deployment('SUCCESS', {commit: 0, finish: 40 * 24 * 60})]).level).toBe('low');
        expect(strategy.calculate([]).level).toBe('n/a');
    });

    it('change failure rate ignores running and canceled deployments', () => {
        const strategy = new ChangeFailureRateStrategy();
        const items = [
            ...Array.from({length: 9}, () => deployment('SUCCESS')),
            deployment('FAILED'), deployment('RUNNING'), deployment('CANCELED'),
        ];
        expect(strategy.calculate(items)).toMatchObject({value: 10, level: 'high', failed: 1, sampleSize: 10});
        expect(strategy.calculate([deployment('SUCCESS')]).level).toBe('elite');
        expect(strategy.calculate([deployment('SUCCESS'), deployment('SUCCESS'), deployment('SUCCESS'),
            deployment('SUCCESS'), deployment('SUCCESS'), deployment('SUCCESS'), deployment('FAILED')]).level).toBe('medium');
        expect(strategy.calculate([deployment('FAILED')]).level).toBe('low');
        expect(strategy.calculate([]).value).toBeNull();
    });

    it('time to restore measures failure -> next success per project', () => {
        const strategy = new TimeToRestoreStrategy();
        const result = strategy.calculate([
            deployment('FAILED', {project: 1, finish: 10}),
            deployment('FAILED', {project: 1, finish: 20}),
            deployment('SUCCESS', {project: 1, finish: 40}),
            deployment('FAILED', {project: 2, finish: 100}),
            deployment('SUCCESS', {project: 1, finish: 110}),
            deployment('SUCCESS', {project: 2, finish: 200}),
        ]);
        expect(result).toMatchObject({value: 65, sampleSize: 2, level: 'high'});
        expect(strategy.calculate([deployment('FAILED', {finish: 0}), deployment('SUCCESS', {finish: 30})]).level)
            .toBe('elite');
        expect(strategy.calculate([deployment('FAILED', {finish: 0}), deployment('SUCCESS', {finish: 3 * 24 * 60})]).level)
            .toBe('medium');
        expect(strategy.calculate([deployment('FAILED', {finish: 0}), deployment('SUCCESS', {finish: 8 * 24 * 60})]).level)
            .toBe('low');
        expect(strategy.calculate([deployment('SUCCESS')])).toMatchObject({value: null, level: 'n/a'});
    });

    it('pipeline duration is compared with the NFR-04 target', () => {
        const strategy = new PipelineDurationStrategy(3);
        expect(strategy.calculate([deployment('SUCCESS', {start: 0, finish: 2})])).toMatchObject({value: 2, level: 'elite', target: 3});
        expect(strategy.calculate([deployment('FAILED', {start: 0, finish: 5})]).level).toBe('medium');
        expect(strategy.calculate([]).level).toBe('n/a');
    });

    it('the calculator runs every registered strategy', () => {
        const calculator = createDoraMetricsCalculator();
        const result = calculator.calculate([deployment('SUCCESS')], {days: 1});
        expect(Object.keys(result)).toEqual([
            'deploymentFrequency', 'leadTimeForChanges', 'changeFailureRate', 'timeToRestore', 'pipelineDuration',
        ]);

        class Constant extends MetricStrategy {
            get key() {
                return 'constant';
            }

            get label() {
                return 'Constant';
            }

            calculate() {
                return this.result({value: 1, unit: 'x', level: 'elite', sampleSize: 0});
            }
        }
        expect(new MetricsCalculator().register(new Constant()).calculate([], {})).toEqual({
            constant: {key: 'constant', label: 'Constant', value: 1, unit: 'x', level: 'elite', sampleSize: 0},
        });
        const abstract = new MetricStrategy();
        expect(() => abstract.key).toThrow('must be implemented');
        expect(() => abstract.label).toThrow('must be implemented');
        expect(() => abstract.calculate()).toThrow('must be implemented');
    });
});

describe('Builder pattern: DeploymentQueryBuilder', () => {
    it('builds a default query with a limit parameter', () => {
        const {text, values} = new DeploymentQueryBuilder().build();
        expect(text).not.toContain('WHERE');
        expect(text).toContain('ORDER BY COALESCE(d.started_at, d.deployed_at) DESC');
        expect(text).toContain('LIMIT $1');
        expect(values).toEqual([100]);
    });

    it('chains conditions into one parameterised statement', () => {
        const since = new Date('2026-10-01T00:00:00Z');
        const {text, values} = new DeploymentQueryBuilder()
            .forProjects([1, '2'])
            .withStatuses(['SUCCESS', 'DROP TABLE'])
            .since(since)
            .until(since)
            .excludeEvents(['pull_request'])
            .search('v1_%')
            .startedOrPendingSince(since)
            .onlyStartedRuns()
            .oldestFirst()
            .limit(10_000)
            .build();

        expect(text).toContain('d.project_id = ANY($1::int[])');
        expect(text).toContain('d.deploy_status = ANY($2::text[])');
        expect(text).toContain('d.version_tag ILIKE $6');
        expect(text).toContain('d.run_id IS NOT NULL');
        expect(text).toContain('ASC');
        expect(text).not.toContain('DROP TABLE');
        expect(values).toEqual([[1, 2], ['SUCCESS'], since, since, ['pull_request'], '%v1\\_\\%%', since, 500]);
    });

    it('handles empty visibility, empty search and unlimited queries', () => {
        const {text, values} = new DeploymentQueryBuilder().forProjects([]).forProjects(null).search('  ').limit('x')
            .unlimited().build();
        expect(text).toContain('WHERE FALSE');
        expect(text).not.toContain('LIMIT');
        expect(values).toEqual([]);
    });
});
