import {Router} from 'express';
import auth from '../middleware/auth.js';
import {
    deleteDeployment,
    getDeployment,
    getDeployments,
    triggerDeployment,
} from '../controllers/deploymentController.js';

const router = Router();

router.get('/', getDeployments);
router.get('/:id', getDeployment);
router.post('/', auth, triggerDeployment);
router.delete('/:id', auth, deleteDeployment);

export default router;
