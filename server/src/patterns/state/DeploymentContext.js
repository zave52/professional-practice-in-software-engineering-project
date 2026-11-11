import {DeploymentStateFactory} from './DeploymentStateFactory.js';

/**
 * State pattern: context. Holds the current state of one deployment and delegates every
 * lifecycle operation to it. The list of transitions is kept for audit events.
 */
export class DeploymentContext {
    constructor(initialStatus = 'RUNNING') {
        this.state = DeploymentStateFactory.create(initialStatus);
        this.transitions = [];
    }

    getState() {
        return this.state;
    }

    getStatus() {
        return this.state.status;
    }

    allowedActions() {
        return this.state.allowedActions();
    }

    transitionTo(status) {
        const next = DeploymentStateFactory.create(status);
        if (next !== this.state) {
            this.transitions.push({from: this.state.status, to: next.status});
            this.state = next;
        }
    }

    cancel() {
        this.state.cancel(this);
        return this;
    }

    rerun() {
        this.state.rerun(this);
        return this;
    }

    complete(success) {
        this.state.complete(this, success);
        return this;
    }

    markCanceled() {
        this.state.markCanceled(this);
        return this;
    }

    /**
     * Applies an observation from the CI provider. Returns true when the status changed.
     * `newAttempt` is true when the provider reports a higher run_attempt than the stored one.
     */
    applyRemote(remoteStatus, {newAttempt = false} = {}) {
        const before = this.getStatus();
        if (newAttempt) {
            this.state.onNewAttempt(this);
        }
        this.state.onRemoteStatus(this, remoteStatus);
        return before !== this.getStatus();
    }
}

export default DeploymentContext;
