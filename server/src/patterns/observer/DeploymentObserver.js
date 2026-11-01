export class DeploymentObserver {
    update() {
        throw new Error('DeploymentObserver.update must be implemented by subclasses.');
    }
}

export default DeploymentObserver;
