import {CanceledState} from './CanceledState.js';
import {DeploymentState} from './DeploymentState.js';
import {FailedState} from './FailedState.js';
import {SuccessState} from './SuccessState.js';

export class RunningState extends DeploymentState {
    constructor() {
        super();
        this.status = 'RUNNING';
    }

    cancel(context) {
        context.setState(new CanceledState());
    }

    rerun() {
        const error = new Error('Cannot rerun an active running deployment');
        error.status = 400;
        throw error;
    }

    complete(context, success) {
        context.setState(success ? new SuccessState() : new FailedState());
    }
}

export default RunningState;
