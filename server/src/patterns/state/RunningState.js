import {DeploymentState} from './DeploymentState.js';

export class RunningState extends DeploymentState {
    get status() {
        return 'RUNNING';
    }

    allowedActions() {
        return ['cancel'];
    }

    cancel(context) {
        context.transitionTo('CANCELING');
    }

    complete(context, success) {
        context.transitionTo(success ? 'SUCCESS' : 'FAILED');
    }

    markCanceled(context) {
        context.transitionTo('CANCELED');
    }

    onNewAttempt() {
        // Already running: a new attempt keeps the deployment in RUNNING.
    }

    onRemoteStatus(context, remoteStatus) {
        if (remoteStatus === 'SUCCESS' || remoteStatus === 'FAILED') {
            this.complete(context, remoteStatus === 'SUCCESS');
        } else if (remoteStatus === 'CANCELED') {
            this.markCanceled(context);
        }
    }
}

export default RunningState;
