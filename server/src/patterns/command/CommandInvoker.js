import {DOMAIN_EVENTS} from '../observer/EventPublisher.js';

/**
 * Command pattern: invoker. Executes any Command uniformly, keeps a bounded execution
 * history (name, actor, outcome, duration) and reports rejected operations to observers,
 * so failed attempts appear in the audit log as well as successful ones.
 */
export class CommandInvoker {
    constructor({publisher, logger, historyLimit = 100, now = () => Date.now()} = {}) {
        this.publisher = publisher;
        this.logger = logger;
        this.historyLimit = historyLimit;
        this.now = now;
        this.entries = [];
    }

    async execute(command) {
        const startedAt = this.now();
        try {
            const result = await command.execute();
            this.#record(command, 'succeeded', startedAt);
            return result;
        } catch (error) {
            this.#record(command, 'failed', startedAt, error);
            this.logger?.warn('Command failed', {...command.describe(), status: error.status, reason: error.message});
            await this.publisher?.notify(DOMAIN_EVENTS.ACTION_FAILED, {
                userId: command.actor?.id ?? null,
                command: command.name,
                status: error.status ?? 500,
                reason: error.status && error.status < 500 ? error.message : 'Internal error',
            });
            throw error;
        }
    }

    #record(command, outcome, startedAt, error) {
        this.entries.push({
            command: command.name,
            userId: command.actor?.id ?? null,
            outcome,
            status: error?.status,
            durationMs: this.now() - startedAt,
            at: new Date(startedAt).toISOString(),
        });
        if (this.entries.length > this.historyLimit) {
            this.entries.shift();
        }
    }

    history() {
        return [...this.entries];
    }
}

export default CommandInvoker;
