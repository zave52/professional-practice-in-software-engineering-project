import {DeploymentQueryBuilder} from '../patterns/builder/DeploymentQueryBuilder.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * DORA metrics of the deployments visible to a user. Pull-request validation runs are not
 * deployments and are excluded.
 */
export class MetricsService {
    constructor({deploymentRepository, calculator, activityObserver, now = () => new Date()}) {
        this.deploymentRepository = deploymentRepository;
        this.calculator = calculator;
        this.activityObserver = activityObserver;
        this.now = now;
    }

    async getMetrics(projectIds, {days}) {
        const to = this.now();
        const from = new Date(to.getTime() - days * DAY);
        const deployments = await this.deploymentRepository.findMany(
            new DeploymentQueryBuilder()
                .forProjects(projectIds)
                .onlyStartedRuns()
                .excludeEvents(['pull_request'])
                .since(from)
                .oldestFirst()
                .unlimited(),
        );
        const totals = {total: deployments.length};
        deployments.forEach(({deploy_status: status}) => {
            totals[status.toLowerCase()] = (totals[status.toLowerCase()] || 0) + 1;
        });
        return {
            period: {from: from.toISOString(), to: to.toISOString(), days},
            metrics: this.calculator.calculate(deployments, {from, to, days}),
            totals,
            activity: this.activityObserver?.snapshot(),
        };
    }
}

export default MetricsService;
