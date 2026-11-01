import {DeploymentState} from './DeploymentState.js';
import {RunningState} from './RunningState.js';

export class SuccessState extends DeploymentState {
    constructor() {
        super();
        this.status = 'SUCCESS';
    }

    rerun(context) {
        context.setState(new RunningState());
    }

    cancel() {
        const error = new Error('Cannot cancel an already completed deployment');
        error.status = 400;
        throw error;
    }
}

export default SuccessState;
