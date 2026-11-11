import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {AuthenticationError, ForbiddenError, ServiceUnavailableError, ValidationError} from '../errors/AppError.js';
import {ROLES} from '../patterns/strategy/access/AccessPolicy.js';

const STATE_PURPOSE = 'oauth_state';
const SESSION_PURPOSE = 'session';

/** Public part of the signed-in user returned to the browser (never the GitHub token). */
export const toSessionDto = (user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    avatar_url: user.avatarUrl,
    role: user.role,
});

/**
 * GitHub OAuth 2.0 (authorization code flow) and JWT sessions.
 * The session JWT contains only the user id; role, activity flag and the GitHub token are
 * loaded from the database on every request, so role changes and deactivation apply
 * immediately.
 */
export class AuthService {
    static SESSION_COOKIE = 'cicd_session';
    static STATE_COOKIE = 'github_oauth_state';

    constructor({config, userRepository, tokenCipher, httpClient}) {
        this.config = config;
        this.userRepository = userRepository;
        this.tokenCipher = tokenCipher;
        this.http = httpClient;
    }

    #secret() {
        if (!this.config.jwtSecret) {
            throw new ServiceUnavailableError('Authentication is not configured.');
        }
        return this.config.jwtSecret;
    }

    #assertOAuthConfigured() {
        if (!this.config.github.clientId || !this.config.github.clientSecret) {
            throw new ServiceUnavailableError('GitHub OAuth is not configured.');
        }
    }

    createOAuthState() {
        return jwt.sign(
            {purpose: STATE_PURPOSE, nonce: crypto.randomBytes(24).toString('hex')},
            this.#secret(),
            {expiresIn: '10m'},
        );
    }

    verifyOAuthState(state, cookieValue) {
        if (!state || !cookieValue || state !== cookieValue) {
            throw new ValidationError('Invalid GitHub login state.');
        }
        try {
            if (jwt.verify(state, this.#secret()).purpose !== STATE_PURPOSE) {
                throw new Error('Wrong token purpose');
            }
        } catch {
            throw new ValidationError('GitHub login state expired. Please try again.');
        }
    }

    getAuthorizationUrl(state) {
        this.#assertOAuthConfigured();
        const params = new URLSearchParams({
            client_id: this.config.github.clientId,
            redirect_uri: this.config.github.callbackUrl,
            scope: 'read:user user:email repo workflow',
            state,
        });
        return `${this.config.github.oauthBaseUrl}/login/oauth/authorize?${params}`;
    }

    async exchangeCode(code) {
        this.#assertOAuthConfigured();
        const response = await this.http.request({
            method: 'POST',
            url: `${this.config.github.oauthBaseUrl}/login/oauth/access_token`,
            headers: {Accept: 'application/json'},
            body: {
                client_id: this.config.github.clientId,
                client_secret: this.config.github.clientSecret,
                code,
                redirect_uri: this.config.github.callbackUrl,
            },
        });
        if (!response.ok || response.data?.error || !response.data?.access_token) {
            throw new AuthenticationError('GitHub authorization failed.');
        }
        return response.data.access_token;
    }

    async fetchProfile(accessToken) {
        const get = (path) => this.http.request({
            url: `${this.config.github.apiBaseUrl}${path}`,
            token: accessToken,
            headers: {Accept: 'application/vnd.github+json'},
        });
        const profile = await get('/user');
        if (!profile.ok || !profile.data?.id) {
            throw new AuthenticationError('Unable to read the GitHub profile.');
        }
        let email = profile.data.email;
        if (!email) {
            const emails = await get('/user/emails');
            const list = Array.isArray(emails.data) ? emails.data : [];
            email = list.find((item) => item.primary)?.email || list[0]?.email;
        }
        if (!email) {
            throw new ValidationError('The GitHub account has no accessible email address.');
        }
        return {githubId: profile.data.id, username: profile.data.login, email, avatarUrl: profile.data.avatar_url};
    }

    async completeLogin(code) {
        const accessToken = await this.exchangeCode(code);
        const profile = await this.fetchProfile(accessToken);
        const isAdmin = this.config.adminLogins.includes(String(profile.username).toLowerCase());
        const user = await this.userRepository.upsertGitHubUser({
            ...profile,
            encryptedToken: this.tokenCipher.encrypt(accessToken),
            roleName: isAdmin ? ROLES.ADMIN : ROLES.DEVELOPER,
            promote: isAdmin,
        });
        if (!user.is_active) {
            throw new ForbiddenError('This account has been deactivated.');
        }
        return user;
    }

    createSessionToken(user) {
        return jwt.sign({purpose: SESSION_PURPOSE}, this.#secret(), {
            subject: String(user.id),
            expiresIn: this.config.sessionTtl,
        });
    }

    async resolveSession(token) {
        let payload;
        try {
            payload = jwt.verify(token, this.#secret());
        } catch {
            throw new AuthenticationError('Invalid or expired session.');
        }
        const userId = Number(payload.sub);
        if (payload.purpose !== SESSION_PURPOSE || !Number.isInteger(userId) || userId <= 0) {
            throw new AuthenticationError('Invalid or expired session.');
        }
        const user = await this.userRepository.findById(userId);
        if (!user || !user.is_active) {
            throw new AuthenticationError('Invalid or expired session.');
        }
        let githubAccessToken;
        try {
            githubAccessToken = this.tokenCipher.decrypt(user.github_access_token);
        } catch {
            githubAccessToken = null;
        }
        if (!githubAccessToken) {
            throw new AuthenticationError('Your GitHub authorization has expired. Please sign in again.');
        }
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatar_url,
            role: user.role,
            githubAccessToken,
        };
    }
}

export default AuthService;
