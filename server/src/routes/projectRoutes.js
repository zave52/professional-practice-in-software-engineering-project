import {Router} from 'express';
import {createProject, deleteProject, getProject, getProjects,} from '../controllers/projectController.js';

const router = Router();

router.get('/', getProjects);
router.get('/:id', getProject);
router.post('/', createProject);
router.delete('/:id', deleteProject);

export default router;
