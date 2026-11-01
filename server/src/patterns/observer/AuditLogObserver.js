import {DeploymentObserver} from './DeploymentObserver.js';

export class AuditLogObserver extends DeploymentObserver {
    constructor() {
        super();
        this.records = [];
    }

    update(event, deployment) {
        if (!['DEPLOYMENT_TRIGGERED', 'DEPLOYMENT_CANCELED', 'DEPLOYMENT_RERUN'].includes(event)) {
            return;
        }
        const record = {event, deployment};
        this.records.push(record);
        console.log(`[deployment-audit] ${event}`, deployment);
    }

    getRecords() {
        return [...this.records];
    }
}

export default AuditLogObserver;
