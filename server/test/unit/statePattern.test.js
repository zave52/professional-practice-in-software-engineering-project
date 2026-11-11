import {describe, expect, it} from 'vitest';
import {CancelingState} from '../../src/patterns/state/CancelingState.js';
import {DeploymentContext} from '../../src/patterns/state/DeploymentContext.js';
import {DeploymentStateFactory} from '../../src/patterns/state/DeploymentStateFactory.js';
import {RunningState} from '../../src/patterns/state/RunningState.js';
import {CanceledState, FailedState, SuccessState} from '../../src/patterns/state/TerminalState.js';

describe('State pattern: deployment lifecycle', () => {
    it('creates shared state objects for every persisted status', () => {
        expect(DeploymentStateFactory.create('RUNNING')).toBeInstanceOf(RunningState);
        expect(DeploymentStateFactory.create('CANCELING')).toBeInstanceOf(CancelingState);
        expect(DeploymentStateFactory.create('SUCCESS')).toBeInstanceOf(SuccessState);
        expect(DeploymentStateFactory.create('FAILED')).toBeInstanceOf(FailedState);
        expect(DeploymentStateFactory.create('CANCELED')).toBeInstanceOf(CanceledState);
        expect(DeploymentStateFactory.create('SUCCESS')).toBe(DeploymentStateFactory.create('SUCCESS'));
        expect(() => new DeploymentContext('UNKNOWN')).toThrowError(expect.objectContaining({status: 400}));
    });

    it('moves a running deployment through cancel request and confirmation', () => {
        const context = new DeploymentContext('RUNNING');
        context.cancel();
        expect(context.getStatus()).toBe('CANCELING');
        context.markCanceled();
        expect(context.getStatus()).toBe('CANCELED');
        expect(context.transitions).toEqual([
            {from: 'RUNNING', to: 'CANCELING'},
            {from: 'CANCELING', to: 'CANCELED'},
        ]);
    });

    it('completes running and canceling deployments', () => {
        expect(new DeploymentContext('RUNNING').complete(true).getStatus()).toBe('SUCCESS');
        expect(new DeploymentContext('RUNNING').complete(false).getStatus()).toBe('FAILED');
        expect(new DeploymentContext('CANCELING').complete(true).getStatus()).toBe('SUCCESS');
        expect(new DeploymentContext('RUNNING').markCanceled().getStatus()).toBe('CANCELED');
    });

    it('allows reruns only from terminal states', () => {
        for (const status of ['SUCCESS', 'FAILED', 'CANCELED']) {
            const context = new DeploymentContext(status);
            expect(context.getState().isTerminal).toBe(true);
            expect(context.rerun().getStatus()).toBe('RUNNING');
        }
    });

    it('rejects illegal operations with 409 INVALID_STATE_TRANSITION', () => {
        const illegal = [
            () => new DeploymentContext('RUNNING').rerun(),
            () => new DeploymentContext('CANCELING').cancel(),
            () => new DeploymentContext('CANCELING').rerun(),
            () => new DeploymentContext('SUCCESS').cancel(),
            () => new DeploymentContext('FAILED').complete(true),
            () => new DeploymentContext('CANCELED').markCanceled(),
        ];
        illegal.forEach((operation) => expect(operation)
            .toThrowError(expect.objectContaining({status: 409, code: 'INVALID_STATE_TRANSITION'})));
    });

    it('exposes the actions the UI may offer', () => {
        expect(new DeploymentContext('RUNNING').allowedActions()).toEqual(['cancel']);
        expect(new DeploymentContext('CANCELING').allowedActions()).toEqual([]);
        expect(new DeploymentContext('FAILED').allowedActions()).toEqual(['rerun']);
    });

    describe('applyRemote (synchronisation with GitHub)', () => {
        it.each([
            ['RUNNING', 'SUCCESS', 'SUCCESS', true],
            ['RUNNING', 'FAILED', 'FAILED', true],
            ['RUNNING', 'CANCELED', 'CANCELED', true],
            ['RUNNING', 'RUNNING', 'RUNNING', false],
            ['CANCELING', 'RUNNING', 'CANCELING', false],
            ['CANCELING', 'CANCELED', 'CANCELED', true],
            ['CANCELING', 'SUCCESS', 'SUCCESS', true],
            ['SUCCESS', 'SUCCESS', 'SUCCESS', false],
            ['SUCCESS', 'RUNNING', 'SUCCESS', false],
        ])('%s + remote %s -> %s', (local, remote, expected, changed) => {
            const context = new DeploymentContext(local);
            expect(context.applyRemote(remote)).toBe(changed);
            expect(context.getStatus()).toBe(expected);
        });

        it('treats a new run attempt as an implicit rerun', () => {
            const context = new DeploymentContext('FAILED');
            expect(context.applyRemote('SUCCESS', {newAttempt: true})).toBe(true);
            expect(context.transitions).toEqual([
                {from: 'FAILED', to: 'RUNNING'},
                {from: 'RUNNING', to: 'SUCCESS'},
            ]);

            const canceling = new DeploymentContext('CANCELING');
            canceling.applyRemote('RUNNING', {newAttempt: true});
            expect(canceling.getStatus()).toBe('RUNNING');

            const running = new DeploymentContext('RUNNING');
            expect(running.applyRemote('RUNNING', {newAttempt: true})).toBe(false);
        });
    });
});
