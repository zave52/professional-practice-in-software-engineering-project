const MINUTE = 60_000;

export const minutesBetween = (from, to) => (new Date(to) - new Date(from)) / MINUTE;

export const median = (values) => {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const round = (value, digits = 2) => (value === null ? null : Number(value.toFixed(digits)));

/**
 * Strategy pattern (metric algorithms): common interface.
 *
 * calculate(deployments, period) -> {key, label, value, unit, level, sampleSize, ...}
 * `deployments` are completed or running pipeline runs of the selected projects;
 * `period` is {from, to, days}.
 * `level` follows the DORA performance clusters: elite | high | medium | low | n/a.
 */
export class MetricStrategy {
    get key() {
        throw new Error('MetricStrategy.key must be implemented.');
    }

    get label() {
        throw new Error('MetricStrategy.label must be implemented.');
    }

    // eslint-disable-next-line no-unused-vars
    calculate(deployments, period) {
        throw new Error('MetricStrategy.calculate must be implemented.');
    }

    result({value, unit, level, sampleSize, ...extra}) {
        return {key: this.key, label: this.label, value, unit, level, sampleSize, ...extra};
    }
}
