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
// Triggering is available from the dashboard without a login flow.
// The service records the project's owner as the actor when no JWT is supplied.
router.post('/', triggerDeployment);
router.delete('/:id', auth, deleteDeployment);

export default router;
