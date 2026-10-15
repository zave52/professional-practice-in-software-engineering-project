import crypto from 'node:crypto';

const algorithm = 'aes-256-gcm';

const getKey = () => {
    const value = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    if (!/^[a-f0-9]{64}$/i.test(value || '')) {
        const error = new Error('GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hexadecimal key.');
        error.status = 500;
        throw error;
    }
    return Buffer.from(value, 'hex');
};

export const encryptGitHubToken = (token) => {
    if (typeof token !== 'string' || token.length === 0) {
        throw Object.assign(new Error('GitHub access token is required.'), {status: 500});
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, encrypted].map((value) => value.toString('base64')).join('.');
};

export const decryptGitHubToken = (payload) => {
    if (typeof payload !== 'string') {
        return null;
    }
    const [ivValue, tagValue, encryptedValue] = payload.split('.');
    if (!ivValue || !tagValue || !encryptedValue) {
        const error = new Error('Stored GitHub access token is not encrypted.');
        error.status = 500;
        throw error;
    }
    const decipher = crypto.createDecipheriv(
        algorithm,
        getKey(),
        Buffer.from(ivValue, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64')),
        decipher.final(),
    ]).toString('utf8');
};
