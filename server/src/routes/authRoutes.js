import {Router} from 'express';
import {parseCookies} from '../middleware/authenticate.js';
import {AuthService, toSessionDto} from '../services/AuthService.js';

export const createAuthRoutes = ({authService, config, logger, optionalAuthenticate}) => {
    const router = Router();
    const cookieOptions = (maxAge) => ({
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'lax',
        path: '/',
        ...(maxAge ? {maxAge} : {}),
    });

    router.get('/github', (req, res) => {
        const state = authService.createOAuthState();
        const url = authService.getAuthorizationUrl(state);
        res.cookie(AuthService.STATE_COOKIE, state, cookieOptions(10 * 60_000));
        res.redirect(url);
    });

    router.get('/github/callback', async (req, res) => {
        res.clearCookie(AuthService.STATE_COOKIE, cookieOptions());
        try {
            authService.verifyOAuthState(
                typeof req.query.state === 'string' ? req.query.state : '',
                parseCookies(req.headers.cookie)[AuthService.STATE_COOKIE],
            );
            if (typeof req.query.code !== 'string' || !req.query.code) {
                throw Object.assign(new Error('Missing authorization code.'), {code: 'MISSING_CODE'});
            }
            const user = await authService.completeLogin(req.query.code);
            res.cookie(AuthService.SESSION_COOKIE, authService.createSessionToken(user), cookieOptions(7 * 24 * 3_600_000));
            return res.redirect(config.clientOrigin);
        } catch (error) {
            logger.warn('GitHub login failed', {reason: error.message});
            const reason = encodeURIComponent(error.code || 'LOGIN_FAILED');
            return res.redirect(`${config.clientOrigin}/?login_error=${reason}`);
        }
    });

    router.get('/session', optionalAuthenticate, (req, res) => {
        res.json({user: req.user ? toSessionDto(req.user) : null});
    });

    router.post('/logout', (req, res) => {
        res.clearCookie(AuthService.SESSION_COOKIE, cookieOptions());
        res.status(204).send();
    });

    return router;
};
