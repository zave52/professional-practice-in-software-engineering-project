import {CanceledState} from './CanceledState.js';
import {FailedState} from './FailedState.js';
import {RunningState} from './RunningState.js';
import {SuccessState} from './SuccessState.js';

const stateByStatus = {
    RUNNING: RunningState,
    SUCCESS: SuccessState,
    FAILED: FailedState,
    CANCELED: CanceledState,
};

export class DeploymentContext {
    constructor(initialStatus = 'RUNNING') {
        const StateClass = stateByStatus[initialStatus];
        if (!StateClass) {
            const error = new Error(`Invalid deployment status: ${initialStatus}`);
            error.status = 400;
            throw error;
        }
        this.setState(new StateClass());
    }

    getState() {
        return this.state;
    }

    getStatus() {
        return this.state.status;
    }

    setState(newState) {
        this.state = newState;
    }

    cancel() {
        return this.state.cancel(this);
    }

    rerun() {
        return this.state.rerun(this);
    }

    complete(success) {
        return this.state.complete(this, success);
    }
}

export default DeploymentContext;
