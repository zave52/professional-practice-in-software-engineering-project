import jwt from 'jsonwebtoken';
import {getCookieName} from '../services/authService.js';
import {findGitHubAccessToken} from '../repositories/userRepository.js';

const getToken = (req) => {
    const header = req.get('authorization');
    const cookie = req.headers.cookie?.split(';').map((item) => item.trim())
        .find((item) => item.startsWith(`${getCookieName()}=`))?.split('=').slice(1).join('=');
    return header?.startsWith('Bearer ') ? header.slice(7).trim() : cookie;
};
const getSecret = () => {
    if (!process.env.JWT_SECRET) throw Object.assign(new Error('JWT_SECRET is not configured.'), {status: 500});
    return process.env.JWT_SECRET;
};

export default async function auth(req, res, next) {
    const token = getToken(req);
    if (!token) return res.status(401).json({status: 401, message: 'Authentication is required.'});
    try {
        req.user = jwt.verify(token, getSecret());
        if (!Number.isInteger(Number(req.user.id)) || Number(req.user.id) <= 0) {
            return res.status(401).json({status: 401, message: 'Token does not contain a valid user id.'});
        }
        req.user.id = Number(req.user.id);
        req.user.githubAccessToken = await findGitHubAccessToken(req.user.id);
        return next();
    } catch (error) {
        if (error.status === 500) return next(error);
        return res.status(401).json({status: 401, message: 'Invalid or expired session.'});
    }
}

export function optionalAuth(req, res, next) {
    const token = getToken(req);
    if (!token) return next();
    try {
        req.user = jwt.verify(token, getSecret());
        req.user.id = Number(req.user.id);
    } catch {
        req.user = null;
    }
    return next();
}
