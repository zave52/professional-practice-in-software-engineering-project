import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import * as userRepository from '../repositories/userRepository.js';

const cookieName = 'cicd_session';
const stateCookieName = 'github_oauth_state';
const secret = () => {
    if (!process.env.JWT_SECRET) throw Object.assign(new Error('JWT_SECRET is not configured.'), {status: 500});
    return process.env.JWT_SECRET;
};
const callbackUrl = () => process.env.GITHUB_CALLBACK_URL ||
    `${process.env.API_ORIGIN || 'http://localhost:5000'}/api/auth/github/callback`;

export const getCookieName = () => cookieName;
export const getStateCookieName = () => stateCookieName;
export const createOAuthState = () => jwt.sign({nonce: crypto.randomBytes(24).toString('hex')}, secret(), {expiresIn: '10m'});
export const verifyOAuthState = (value) => jwt.verify(value, secret());
export const createSessionToken = (user) => jwt.sign({
    id: user.id, github_id: user.github_id, username: user.username, email: user.email, avatar_url: user.avatar_url,
}, secret(), {expiresIn: '7d'});
export const getGitHubAuthorizationUrl = (state) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
        throw Object.assign(new Error('GitHub OAuth is not configured.'), {status: 503});
    }
    const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        redirect_uri: callbackUrl(),
        scope: 'read:user user:email',
        state,
    });
    return `https://github.com/login/oauth/authorize?${params}`;
};
export const exchangeCode = async (code) => {
    const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET,
            code, redirect_uri: callbackUrl()
        }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error || !payload.access_token) throw Object.assign(new Error('GitHub authorization failed.'), {status: 401});
    return payload.access_token;
};
export const fetchGitHubUser = async (accessToken) => {
    const headers = {Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}`};
    const profileResponse = await fetch('https://api.github.com/user', {headers});
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw Object.assign(new Error('Unable to read GitHub profile.'), {status: 401});
    let email = profile.email;
    if (!email) {
        const emailResponse = await fetch('https://api.github.com/user/emails', {headers});
        const emails = await emailResponse.json();
        email = emails.find((item) => item.primary)?.email || emails[0]?.email;
    }
    if (!email) throw Object.assign(new Error('GitHub account has no accessible email address.'), {status: 400});
    return {githubId: profile.id, username: profile.login, email, avatarUrl: profile.avatar_url};
};
export const upsertGitHubUser = (profile) => userRepository.upsertGitHubUser(profile);
