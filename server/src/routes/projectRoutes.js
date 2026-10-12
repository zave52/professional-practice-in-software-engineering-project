import { Router } from 'express';
import auth from '../middleware/auth.js';
import {
  createProject,
  deleteProject,
  getProject,
  getProjects,
} from '../controllers/projectController.js';

const router = Router();

router.get('/', getProjects);
router.get('/:id', getProject);
router.post('/', auth, createProject);
router.delete('/:id', auth, deleteProject);

export default router;
