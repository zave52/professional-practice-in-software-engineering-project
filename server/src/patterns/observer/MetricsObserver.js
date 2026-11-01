import {DeploymentObserver} from './DeploymentObserver.js';

export class MetricsObserver extends DeploymentObserver {
    constructor() {
        super();
        this.metrics = {
            totalTriggered: 0,
            totalCanceled: 0,
            totalRerun: 0,
        };
    }

    update(event) {
        if (event === 'DEPLOYMENT_TRIGGERED') {
            this.metrics.totalTriggered += 1;
        } else if (event === 'DEPLOYMENT_CANCELED') {
            this.metrics.totalCanceled += 1;
        } else if (event === 'DEPLOYMENT_RERUN') {
            this.metrics.totalRerun += 1;
        }
    }

    getMetrics() {
        return {...this.metrics};
    }
}

export default MetricsObserver;
