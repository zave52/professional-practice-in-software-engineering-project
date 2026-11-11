import {AppError} from '../errors/AppError.js';

export const notFoundHandler = (req, res) => {
    res.status(404).json({status: 404, code: 'NOT_FOUND', message: 'Route not found.'});
};

/**
 * Converts any error into `{status, code, message}`. Messages of unexpected errors are hidden
 * from the client and logged with the stack trace instead.
 */
export const createErrorHandler = (logger) => (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }
    const rawStatus = error.status ?? error.statusCode;
    const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
    const isAppError = error instanceof AppError;
    const exposed = isAppError ? error.isExposed : status < 500 && error.expose !== false;

    if (status >= 500) {
        logger.error('Request failed', {method: req.method, path: req.path, status, error});
    }
    return res.status(status).json({
        status,
        code: isAppError ? error.code : status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: exposed ? error.message : 'Internal server error.',
    });
};
