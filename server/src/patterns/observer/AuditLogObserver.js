import {EventObserver} from './EventPublisher.js';

/** Concrete observer: writes every domain event to the persistent `audit_log` table. */
export class AuditLogObserver extends EventObserver {
    constructor(auditLogRepository) {
        super();
        this.auditLogRepository = auditLogRepository;
    }

    async update(event, payload) {
        const {userId = null, projectId = null, deploymentId = null, runId = null, ...details} = payload;
        await this.auditLogRepository.record({event, userId, projectId, deploymentId, runId, payload: details});
    }
}

export default AuditLogObserver;
