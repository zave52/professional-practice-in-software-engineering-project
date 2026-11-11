import {DeploymentState} from './DeploymentState.js';

/** Common behaviour of finished deployments: they can only be rerun. */
export class TerminalState extends DeploymentState {
    get isTerminal() {
        return true;
    }

    allowedActions() {
        return ['rerun'];
    }

    rerun(context) {
        context.transitionTo('RUNNING');
    }
}

export class SuccessState extends TerminalState {
    get status() {
        return 'SUCCESS';
    }
}

export class FailedState extends TerminalState {
    get status() {
        return 'FAILED';
    }
}

export class CanceledState extends TerminalState {
    get status() {
        return 'CANCELED';
    }
}
