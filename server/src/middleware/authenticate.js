import {AuthenticationError} from '../errors/AppError.js';
import {AuthService} from '../services/AuthService.js';

export const parseCookies = (header = '') => Object.fromEntries(
    header
        .split(';')
        .map((item) => item.trim())
        .filter((item) => item.includes('='))
        .map((item) => {
            const index = item.indexOf('=');
            const value = item.slice(index + 1);
            try {
                return [item.slice(0, index), decodeURIComponent(value)];
            } catch {
                return [item.slice(0, index), value];
            }
        }),
);

/** Bearer header (API clients, tests) or the httpOnly session cookie (browser). */
export const readSessionToken = (req) => {
    const header = req.get('authorization');
    if (header?.startsWith('Bearer ')) {
        return header.slice(7).trim();
    }
    return parseCookies(req.headers.cookie)[AuthService.SESSION_COOKIE];
};

export const createAuthenticate = (authService) => async (req, res, next) => {
    const token = readSessionToken(req);
    if (!token) {
        return next(new AuthenticationError());
    }
    req.user = await authService.resolveSession(token);
    return next();
};

export const createOptionalAuthenticate = (authService) => async (req, res, next) => {
    const token = readSessionToken(req);
    req.user = null;
    if (token) {
        try {
            req.user = await authService.resolveSession(token);
        } catch (error) {
            if (!(error instanceof AuthenticationError)) {
                return next(error);
            }
        }
    }
    return next();
};
