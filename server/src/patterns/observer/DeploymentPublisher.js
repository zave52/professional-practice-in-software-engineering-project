export class DeploymentPublisher {
    constructor() {
        this.observers = new Set();
    }

    subscribe(observer) {
        this.observers.add(observer);
        return observer;
    }

    unsubscribe(observer) {
        this.observers.delete(observer);
    }

    notify(event, deployment) {
        this.observers.forEach((observer) => observer.update(event, deployment));
    }
}

export const DEPLOYMENT_EVENTS = {
    TRIGGERED: 'DEPLOYMENT_TRIGGERED',
    CANCELED: 'DEPLOYMENT_CANCELED',
    RERUN: 'DEPLOYMENT_RERUN',
};

export const deploymentPublisher = new DeploymentPublisher();

export default deploymentPublisher;
