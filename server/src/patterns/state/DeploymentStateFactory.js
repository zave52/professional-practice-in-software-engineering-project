import {ValidationError} from '../../errors/AppError.js';
import {CancelingState} from './CancelingState.js';
import {RunningState} from './RunningState.js';
import {CanceledState, FailedState, SuccessState} from './TerminalState.js';

/**
 * Simple factory that maps a persisted status string to a state object. States are
 * stateless, so a single shared instance per status is enough (Flyweight-like sharing).
 */
const states = {
    RUNNING: new RunningState(),
    CANCELING: new CancelingState(),
    SUCCESS: new SuccessState(),
    FAILED: new FailedState(),
    CANCELED: new CanceledState(),
};

export const DeploymentStateFactory = {
    create(status) {
        const state = states[status];
        if (!state) {
            throw new ValidationError(`Invalid deployment status: ${status}`);
        }
        return state;
    },
};

export default DeploymentStateFactory;
