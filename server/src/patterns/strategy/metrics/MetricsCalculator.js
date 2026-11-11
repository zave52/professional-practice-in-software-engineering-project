import {
    ChangeFailureRateStrategy,
    DeploymentFrequencyStrategy,
    LeadTimeForChangesStrategy,
    PipelineDurationStrategy,
    TimeToRestoreStrategy,
} from './strategies.js';

/**
 * Strategy pattern: context. Holds an ordered set of metric strategies and runs each of them
 * over the same data. Adding a metric means registering one more strategy.
 */
export class MetricsCalculator {
    constructor(strategies = []) {
        this.strategies = new Map();
        strategies.forEach((strategy) => this.register(strategy));
    }

    register(strategy) {
        this.strategies.set(strategy.key, strategy);
        return this;
    }

    calculate(deployments, period) {
        return Object.fromEntries(
            [...this.strategies.values()].map((strategy) => [strategy.key, strategy.calculate(deployments, period)]),
        );
    }
}

export const createDoraMetricsCalculator = () => new MetricsCalculator([
    new DeploymentFrequencyStrategy(),
    new LeadTimeForChangesStrategy(),
    new ChangeFailureRateStrategy(),
    new TimeToRestoreStrategy(),
    new PipelineDurationStrategy(3),
]);
