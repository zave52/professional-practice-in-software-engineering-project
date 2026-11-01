import {describe, expect, it, vi} from 'vitest';
import {DeploymentPublisher} from '../../src/patterns/observer/DeploymentPublisher.js';

describe('Deployment Observer pattern', () => {
    it('dispatches events and deployment payloads to subscribers', () => {
        const publisher = new DeploymentPublisher();
        const observer = {update: vi.fn()};
        const deployment = {id: 12, deploy_status: 'RUNNING'};

        publisher.subscribe(observer);
        publisher.notify('DEPLOYMENT_TRIGGERED', deployment);

        expect(observer.update).toHaveBeenCalledWith('DEPLOYMENT_TRIGGERED', deployment);
    });

    it('stops dispatching events after unsubscribing', () => {
        const publisher = new DeploymentPublisher();
        const observer = {update: vi.fn()};

        publisher.subscribe(observer);
        publisher.unsubscribe(observer);
        publisher.notify('DEPLOYMENT_CANCELED', {id: 12});

        expect(observer.update).not.toHaveBeenCalled();
    });
});
