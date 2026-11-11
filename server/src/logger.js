const LEVELS = {debug: 10, info: 20, warn: 30, error: 40, silent: 100};

/**
 * Minimal structured logger. In production every record is a single JSON line, so
 * `docker compose logs` output can be filtered with jq or shipped to a log collector.
 */
export class Logger {
    constructor({level = 'info', json = true, fields = {}, sink = console} = {}) {
        this.threshold = LEVELS[level] ?? LEVELS.info;
        this.json = json;
        this.fields = fields;
        this.sink = sink;
    }

    child(fields) {
        const child = new Logger({json: this.json, fields: {...this.fields, ...fields}, sink: this.sink});
        child.threshold = this.threshold;
        return child;
    }

    log(level, message, fields = {}) {
        if ((LEVELS[level] ?? 0) < this.threshold) {
            return;
        }
        const record = {level, time: new Date().toISOString(), message, ...this.fields, ...fields};
        if (record.error instanceof Error) {
            record.error = {name: record.error.name, message: record.error.message, stack: record.error.stack};
        }
        const output = level === 'error' || level === 'warn' ? this.sink.error : this.sink.log;
        if (this.json) {
            output.call(this.sink, JSON.stringify(record));
        } else {
            const {level: _level, time, message: text, ...rest} = record;
            const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
            output.call(this.sink, `${time} ${level.toUpperCase()} ${text}${extra}`);
        }
    }

    debug(message, fields) {
        this.log('debug', message, fields);
    }

    info(message, fields) {
        this.log('info', message, fields);
    }

    warn(message, fields) {
        this.log('warn', message, fields);
    }

    error(message, fields) {
        this.log('error', message, fields);
    }
}

export const createLogger = (config) => new Logger({
    level: config.logLevel,
    json: config.isProduction,
});

export const silentLogger = new Logger({level: 'silent'});
