import {median, MetricStrategy, minutesBetween, round} from './MetricStrategy.js';

const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

const byFinishTime = (left, right) => new Date(left.finished_at) - new Date(right.finished_at);

/** How often production is successfully deployed. */
export class DeploymentFrequencyStrategy extends MetricStrategy {
    get key() {
        return 'deploymentFrequency';
    }

    get label() {
        return 'Deployment frequency';
    }

    calculate(deployments, {days}) {
        const successful = deployments.filter((item) => item.deploy_status === 'SUCCESS').length;
        const perDay = days > 0 ? successful / days : 0;
        let level = 'low';
        if (perDay >= 1) {
            level = 'elite';
        } else if (perDay >= 1 / 7) {
            level = 'high';
        } else if (perDay >= 1 / 30) {
            level = 'medium';
        }
        return this.result({
            value: round(perDay),
            unit: 'per day',
            level: successful === 0 ? 'n/a' : level,
            sampleSize: successful,
            perWeek: round(perDay * 7),
        });
    }
}

/** Median time from the commit to its successful deployment. */
export class LeadTimeForChangesStrategy extends MetricStrategy {
    get key() {
        return 'leadTimeForChanges';
    }

    get label() {
        return 'Lead time for changes';
    }

    calculate(deployments) {
        const samples = deployments
            .filter((item) => item.deploy_status === 'SUCCESS' && item.commit_at && item.finished_at)
            .map((item) => minutesBetween(item.commit_at, item.finished_at))
            .filter((minutes) => minutes >= 0);
        const value = median(samples);
        let level = 'n/a';
        if (value !== null) {
            level = value < DAY ? 'elite' : value < WEEK ? 'high' : value < MONTH ? 'medium' : 'low';
        }
        return this.result({value: round(value, 1), unit: 'minutes', level, sampleSize: samples.length});
    }
}

/** Share of completed deployments that failed. */
export class ChangeFailureRateStrategy extends MetricStrategy {
    get key() {
        return 'changeFailureRate';
    }

    get label() {
        return 'Change failure rate';
    }

    calculate(deployments) {
        const completed = deployments.filter((item) => ['SUCCESS', 'FAILED'].includes(item.deploy_status));
        const failed = completed.filter((item) => item.deploy_status === 'FAILED').length;
        const value = completed.length ? (failed / completed.length) * 100 : null;
        let level = 'n/a';
        if (value !== null) {
            level = value <= 5 ? 'elite' : value <= 10 ? 'high' : value <= 15 ? 'medium' : 'low';
        }
        return this.result({value: round(value, 1), unit: '%', level, sampleSize: completed.length, failed});
    }
}

/** Median time from the first failed deployment to the next successful one (per project). */
export class TimeToRestoreStrategy extends MetricStrategy {
    get key() {
        return 'timeToRestore';
    }

    get label() {
        return 'Time to restore service';
    }

    calculate(deployments) {
        const byProject = new Map();
        deployments
            .filter((item) => ['SUCCESS', 'FAILED'].includes(item.deploy_status) && item.finished_at)
            .forEach((item) => {
                byProject.set(item.project_id, [...(byProject.get(item.project_id) || []), item]);
            });

        const samples = [];
        for (const items of byProject.values()) {
            let failedSince = null;
            for (const item of items.sort(byFinishTime)) {
                if (item.deploy_status === 'FAILED' && failedSince === null) {
                    failedSince = item.finished_at;
                } else if (item.deploy_status === 'SUCCESS' && failedSince !== null) {
                    samples.push(minutesBetween(failedSince, item.finished_at));
                    failedSince = null;
                }
            }
        }
        const value = median(samples);
        let level = 'n/a';
        if (value !== null) {
            level = value < HOUR ? 'elite' : value < DAY ? 'high' : value < WEEK ? 'medium' : 'low';
        }
        return this.result({value: round(value, 1), unit: 'minutes', level, sampleSize: samples.length});
    }
}

/**
 * Median pipeline duration, compared with requirement NFR-04 (CI must finish in 3 minutes).
 * Not a DORA metric, but it tells which stage limits the lead time.
 */
export class PipelineDurationStrategy extends MetricStrategy {
    constructor(targetMinutes = 3) {
        super();
        this.targetMinutes = targetMinutes;
    }

    get key() {
        return 'pipelineDuration';
    }

    get label() {
        return 'Pipeline duration';
    }

    calculate(deployments) {
        const samples = deployments
            .filter((item) => ['SUCCESS', 'FAILED'].includes(item.deploy_status) && item.started_at && item.finished_at)
            .map((item) => minutesBetween(item.started_at, item.finished_at))
            .filter((minutes) => minutes >= 0);
        const value = median(samples);
        return this.result({
            value: round(value, 1),
            unit: 'minutes',
            level: value === null ? 'n/a' : value <= this.targetMinutes ? 'elite' : 'medium',
            sampleSize: samples.length,
            target: this.targetMinutes,
        });
    }
}
