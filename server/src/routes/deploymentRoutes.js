import {Router} from 'express';
import auth from '../middleware/auth.js';
import {
    deleteDeployment,
    getDeployment,
    getDeployments,
    rerunDeployment,
    triggerDeployment,
} from '../controllers/deploymentController.js';

const router = Router();

router.get('/', auth, getDeployments);
router.get('/:id', auth, getDeployment);
router.post('/', auth, triggerDeployment);
router.post('/:id/rerun', auth, rerunDeployment);
router.delete('/:id', auth, deleteDeployment);

export default router;
