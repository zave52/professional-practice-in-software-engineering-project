export const formatDate = (value) => (value
    ? new Date(value).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})
    : '—');

export const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined) {
        return '—';
    }
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
};

export const formatMinutes = (minutes) => {
    if (minutes === null || minutes === undefined) {
        return '—';
    }
    if (minutes < 60) {
        return `${Number(minutes.toFixed(1))} min`;
    }
    if (minutes < 24 * 60) {
        return `${Number((minutes / 60).toFixed(1))} h`;
    }
    return `${Number((minutes / (24 * 60)).toFixed(1))} d`;
};

/** Renders a metric value according to its unit. */
export const formatMetric = (metric) => {
    if (!metric || metric.value === null || metric.value === undefined) {
        return '—';
    }
    if (metric.unit === 'minutes') {
        return formatMinutes(metric.value);
    }
    if (metric.unit === '%') {
        return `${metric.value}%`;
    }
    return `${metric.value} ${metric.unit}`;
};

export const humanizeEvent = (event) => String(event || '')
    .toLowerCase()
    .split('_')
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');

export const shortSha = (sha) => (sha ? sha.slice(0, 8) : '—');
