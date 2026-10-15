import {Router} from 'express';
import auth from '../middleware/auth.js';
import {getPipelines, getRefs, getWorkflows} from '../controllers/githubActionsController.js';

const router = Router();

router.get('/', auth, getPipelines);
router.get('/refs', auth, getRefs);
router.get('/workflows', auth, getWorkflows);

export default router;
