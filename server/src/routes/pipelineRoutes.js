import {Router} from 'express';
import {getPipelines} from '../controllers/githubActionsController.js';

const router = Router();

router.get('/', getPipelines);

export default router;
