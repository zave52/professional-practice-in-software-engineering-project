/**
 * Chain of Responsibility pattern: abstract handler.
 *
 * A request context `{actor, input, values, project, deployment}` travels along a chain of
 * small handlers. Each handler checks or enriches one aspect (id format, existence, access
 * rights, git ref syntax ...) and either stops the chain by throwing a typed AppError or
 * passes the context to its successor. Commands assemble only the handlers they need.
 */
export class ValidationHandler {
    constructor() {
        this.next = null;
    }

    setNext(handler) {
        this.next = handler;
        return handler;
    }

    async handle(context) {
        await this.process(context);
        return this.next ? this.next.handle(context) : context;
    }

    // eslint-disable-next-line no-unused-vars
    async process(context) {
        throw new Error('ValidationHandler.process must be implemented.');
    }
}

/** Links handlers in the given order and returns the head of the chain. */
export const buildChain = (...handlers) => {
    handlers.reduce((previous, handler) => previous.setNext(handler));
    return handlers[0];
};

export const createContext = ({actor, input = {}}) => ({actor, input, values: {}});
