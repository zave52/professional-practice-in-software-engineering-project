export class DeploymentState {
    cancel() {
        throw this.invalidAction('cancel');
    }

    rerun() {
        throw this.invalidAction('rerun');
    }

    complete() {
        throw this.invalidAction('complete');
    }

    invalidAction(action) {
        const error = new Error(`Cannot ${action} deployment in the current state.`);
        error.status = 400;
        return error;
    }
}

export default DeploymentState;
