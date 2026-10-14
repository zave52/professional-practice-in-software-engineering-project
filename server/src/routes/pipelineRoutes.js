import {Router} from 'express';
import {getPipelines, getRefs} from '../controllers/githubActionsController.js';

const router = Router();

router.get('/', getPipelines);
router.get('/refs', getRefs);

export default router;
