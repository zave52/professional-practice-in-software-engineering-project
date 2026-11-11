/**
 * Observer pattern: subject.
 *
 * Commands and the synchroniser publish domain events; they do not know who listens.
 * Observers are isolated from each other: a failing observer (for example the audit log
 * when the database is briefly unavailable) is logged and does not break the business
 * operation or the remaining observers.
 */
export const DOMAIN_EVENTS = Object.freeze({
    DEPLOYMENT_TRIGGERED: 'DEPLOYMENT_TRIGGERED',
    DEPLOYMENT_CANCEL_REQUESTED: 'DEPLOYMENT_CANCEL_REQUESTED',
    DEPLOYMENT_RERUN_REQUESTED: 'DEPLOYMENT_RERUN_REQUESTED',
    DEPLOYMENT_STATUS_CHANGED: 'DEPLOYMENT_STATUS_CHANGED',
    PROJECT_CREATED: 'PROJECT_CREATED',
    PROJECT_DELETED: 'PROJECT_DELETED',
    ACTION_FAILED: 'ACTION_FAILED',
});

export class EventObserver {
    // eslint-disable-next-line no-unused-vars
    update(event, payload) {
        throw new Error('EventObserver.update must be implemented.');
    }
}

export class EventPublisher {
    constructor({logger} = {}) {
        this.observers = new Set();
        this.logger = logger;
    }

    subscribe(observer) {
        this.observers.add(observer);
        return () => this.unsubscribe(observer);
    }

    unsubscribe(observer) {
        this.observers.delete(observer);
    }

    async notify(event, payload = {}) {
        const results = await Promise.allSettled(
            [...this.observers].map(async (observer) => observer.update(event, payload)),
        );
        results
            .filter((result) => result.status === 'rejected')
            .forEach((result) => this.logger?.error('Event observer failed', {event, error: result.reason}));
    }
}

export default EventPublisher;
