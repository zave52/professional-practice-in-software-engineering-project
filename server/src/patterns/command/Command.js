import {createContext} from '../chain/ValidationHandler.js';

/**
 * Command pattern + Template Method pattern.
 *
 * Each user operation on a deployment (trigger, cancel, rerun) is an object that captures
 * the actor and input and can be executed later by the CommandInvoker. `execute()` is a
 * template method that fixes the algorithm skeleton:
 *
 *   1. validate()  - run the command-specific Chain of Responsibility;
 *   2. perform()   - the actual work (abstract, implemented by subclasses);
 *   3. publish()   - announce the resulting domain event to observers.
 *
 * Subclasses override only the varying steps: createValidationChain(), perform() and
 * eventFor().
 */
export class Command {
    constructor({actor, input = {}}, dependencies) {
        this.actor = actor;
        this.input = input;
        this.dependencies = dependencies;
    }

    get name() {
        throw new Error('Command.name must be implemented.');
    }

    async execute() {
        const context = await this.validate();
        const result = await this.perform(context);
        await this.publish(context, result);
        return result;
    }

    async validate() {
        return this.createValidationChain().handle(createContext({actor: this.actor, input: this.input}));
    }

    createValidationChain() {
        throw new Error('Command.createValidationChain must be implemented.');
    }

    // eslint-disable-next-line no-unused-vars
    async perform(context) {
        throw new Error('Command.perform must be implemented.');
    }

    /** Hook: returns `{event, payload}` or null when nothing should be published. */
    // eslint-disable-next-line no-unused-vars
    eventFor(context, result) {
        return null;
    }

    async publish(context, result) {
        const event = this.eventFor(context, result);
        if (event) {
            await this.dependencies.publisher.notify(event.event, {userId: this.actor?.id, ...event.payload});
        }
    }

    describe() {
        return {command: this.name, userId: this.actor?.id ?? null, input: this.input};
    }
}

export default Command;
