import crypto from 'node:crypto';
import {AppError} from '../errors/AppError.js';

const ALGORITHM = 'aes-256-gcm';

/**
 * Authenticated encryption (AES-256-GCM) of GitHub access tokens at rest.
 * Stored format: base64(iv).base64(authTag).base64(ciphertext).
 */
export class TokenCipher {
    constructor(hexKey) {
        this.hexKey = hexKey;
    }

    #key() {
        if (!/^[a-f0-9]{64}$/i.test(this.hexKey || '')) {
            throw new AppError('GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hexadecimal key.', {
                status: 500,
                code: 'CONFIGURATION_ERROR',
            });
        }
        return Buffer.from(this.hexKey, 'hex');
    }

    encrypt(token) {
        if (typeof token !== 'string' || token.length === 0) {
            throw new AppError('GitHub access token is required.', {status: 500});
        }
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGORITHM, this.#key(), iv);
        const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
        return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
    }

    decrypt(payload) {
        if (typeof payload !== 'string' || payload.length === 0) {
            return null;
        }
        const [iv, tag, encrypted] = payload.split('.');
        if (!iv || !tag || !encrypted) {
            throw new AppError('Stored GitHub access token is not encrypted.', {status: 500});
        }
        const decipher = crypto.createDecipheriv(ALGORITHM, this.#key(), Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
    }
}

export default TokenCipher;
