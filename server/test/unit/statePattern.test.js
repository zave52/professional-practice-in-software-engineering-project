import {describe, expect, it} from 'vitest';
import {CanceledState} from '../../src/patterns/state/CanceledState.js';
import {DeploymentContext} from '../../src/patterns/state/DeploymentContext.js';
import {FailedState} from '../../src/patterns/state/FailedState.js';
import {RunningState} from '../../src/patterns/state/RunningState.js';
import {SuccessState} from '../../src/patterns/state/SuccessState.js';

describe('Deployment State pattern', () => {
    it('transitions a running deployment to canceled', () => {
        const context = new DeploymentContext('RUNNING');
        context.cancel();
        expect(context.getState()).toBeInstanceOf(CanceledState);
        expect(context.getStatus()).toBe('CANCELED');
    });

    it('transitions a running deployment to success or failure', () => {
        const successful = new DeploymentContext('RUNNING');
        successful.complete(true);
        expect(successful.getState()).toBeInstanceOf(SuccessState);

        const failed = new DeploymentContext('RUNNING');
        failed.complete(false);
        expect(failed.getState()).toBeInstanceOf(FailedState);
    });

    it('rejects invalid lifecycle operations with status 400', () => {
        expect(() => new DeploymentContext('RUNNING').rerun())
            .toThrowError(expect.objectContaining({status: 400}));
        expect(() => new DeploymentContext('SUCCESS').cancel())
            .toThrowError(expect.objectContaining({status: 400}));
        expect(() => new DeploymentContext('FAILED').cancel())
            .toThrowError(expect.objectContaining({status: 400}));
        expect(() => new DeploymentContext('CANCELED').cancel())
            .toThrowError(expect.objectContaining({status: 400}));
    });

    it('allows reruns from completed states', () => {
        for (const status of ['SUCCESS', 'FAILED', 'CANCELED']) {
            const context = new DeploymentContext(status);
            context.rerun();
            expect(context.getState()).toBeInstanceOf(RunningState);
            expect(context.getStatus()).toBe('RUNNING');
        }
    });
});
