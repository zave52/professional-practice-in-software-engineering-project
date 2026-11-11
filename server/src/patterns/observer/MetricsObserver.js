import {DOMAIN_EVENTS, EventObserver} from './EventPublisher.js';

/**
 * Concrete observer: in-process activity counters (since the process started), exposed by
 * GET /api/metrics next to the DORA metrics that are calculated from the database.
 */
export class MetricsObserver extends EventObserver {
    constructor({now = () => new Date()} = {}) {
        super();
        this.startedAt = now().toISOString();
        this.events = Object.fromEntries(Object.values(DOMAIN_EVENTS).map((event) => [event, 0]));
        this.transitions = {};
    }

    update(event, payload = {}) {
        this.events[event] = (this.events[event] || 0) + 1;
        if (event === DOMAIN_EVENTS.DEPLOYMENT_STATUS_CHANGED && payload.from && payload.to) {
            const key = `${payload.from}->${payload.to}`;
            this.transitions[key] = (this.transitions[key] || 0) + 1;
        }
    }

    snapshot() {
        return {since: this.startedAt, events: {...this.events}, transitions: {...this.transitions}};
    }
}

export default MetricsObserver;
