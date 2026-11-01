import {DeploymentState} from './DeploymentState.js';
import {RunningState} from './RunningState.js';

export class CanceledState extends DeploymentState {
    constructor() {
        super();
        this.status = 'CANCELED';
    }

    rerun(context) {
        context.setState(new RunningState());
    }

    cancel() {
        const error = new Error('Deployment is already canceled');
        error.status = 400;
        throw error;
    }
}

export default CanceledState;
