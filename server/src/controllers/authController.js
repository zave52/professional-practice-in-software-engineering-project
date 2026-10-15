import * as authService from '../services/authService.js';

const cookieOptions = (maxAge) => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/', ...(maxAge ? {maxAge} : {}),
});

export const startGitHubLogin = (req, res, next) => {
    try {
        const state = authService.createOAuthState();
        res.cookie(authService.getStateCookieName(), state, {...cookieOptions(600000), signed: false});
        return res.redirect(authService.getGitHubAuthorizationUrl(state));
    } catch (error) {
        return next(error);
    }
};

export const githubCallback = async (req, res, next) => {
    try {
        const {code, state} = req.query;
        const stateCookie = req.headers.cookie?.split(';').map((item) => item.trim())
            .find((item) => item.startsWith(`${authService.getStateCookieName()}=`))?.split('=').slice(1).join('=');
        if (!code || !state || !stateCookie || state !== stateCookie) {
            return res.status(400).json({status: 400, message: 'Invalid GitHub login state.'});
        }
        authService.verifyOAuthState(state);
        const profile = await authService.fetchGitHubUser(await authService.exchangeCode(code));
        const user = await authService.upsertGitHubUser(profile);
        res.clearCookie(authService.getStateCookieName(), cookieOptions());
        res.cookie(authService.getCookieName(), authService.createSessionToken(user), cookieOptions(604800000));
        return res.redirect(process.env.CLIENT_ORIGIN || 'http://localhost:5173');
    } catch (error) {
        return next(error);
    }
};

export const getSession = (req, res) => res.json({user: req.user || null});
export const logout = (req, res) => {
    res.clearCookie(authService.getCookieName(), cookieOptions());
    return res.status(204).send();
};
