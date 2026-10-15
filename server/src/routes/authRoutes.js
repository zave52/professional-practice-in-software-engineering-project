import {Router} from 'express';
import {optionalAuth} from '../middleware/auth.js';
import {getSession, githubCallback, logout, startGitHubLogin} from '../controllers/authController.js';

const router = Router();
router.get('/github', startGitHubLogin);
router.get('/github/callback', githubCallback);
router.get('/session', optionalAuth, getSession);
router.post('/logout', logout);
export default router;
