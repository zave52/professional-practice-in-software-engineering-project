import {Router} from 'express';
import {getPipelines, getRefs, getWorkflows} from '../controllers/githubActionsController.js';

const router = Router();

router.get('/', getPipelines);
router.get('/refs', getRefs);
router.get('/workflows', getWorkflows);

export default router;
