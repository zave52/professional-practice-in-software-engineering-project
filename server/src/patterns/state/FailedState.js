import {DeploymentState} from './DeploymentState.js';
import {RunningState} from './RunningState.js';

export class FailedState extends DeploymentState {
    constructor() {
        super();
        this.status = 'FAILED';
    }

    rerun(context) {
        context.setState(new RunningState());
    }

    cancel() {
        const error = new Error('Cannot cancel a failed deployment');
        error.status = 400;
        throw error;
    }
}

export default FailedState;
