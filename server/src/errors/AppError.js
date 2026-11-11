/**
 * Application error hierarchy. Every expected failure carries an HTTP status and a stable
 * machine-readable code, which replaces the previous `Object.assign(new Error(), {status})`
 * idiom repeated across services.
 */
export class AppError extends Error {
    constructor(message, {status = 500, code = 'INTERNAL_ERROR', details, cause} = {}) {
        super(message, cause ? {cause} : undefined);
        this.name = new.target.name;
        this.status = status;
        this.code = code;
        if (details !== undefined) {
            this.details = details;
        }
    }

    /** Messages of client errors and of 503 are safe to show; other 5xx messages are hidden. */
    get isExposed() {
        return this.status < 500 || this.status === 503;
    }
}

export class ValidationError extends AppError {
    constructor(message, details) {
        super(message, {status: 400, code: 'VALIDATION_ERROR', details});
    }
}

export class AuthenticationError extends AppError {
    constructor(message = 'Authentication is required.') {
        super(message, {status: 401, code: 'UNAUTHENTICATED'});
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'You do not have permission to perform this action.') {
        super(message, {status: 403, code: 'FORBIDDEN'});
    }
}

export class NotFoundError extends AppError {
    constructor(message = 'Resource not found.') {
        super(message, {status: 404, code: 'NOT_FOUND'});
    }
}

export class ConflictError extends AppError {
    constructor(message, code = 'CONFLICT') {
        super(message, {status: 409, code});
    }
}

export class UpstreamError extends AppError {
    constructor(message, {cause} = {}) {
        super(message, {status: 502, code: 'UPSTREAM_ERROR', cause});
    }
}

export class ServiceUnavailableError extends AppError {
    constructor(message = 'Service is temporarily unavailable.') {
        super(message, {status: 503, code: 'SERVICE_UNAVAILABLE'});
    }
}

export const PG_UNIQUE_VIOLATION = '23505';
