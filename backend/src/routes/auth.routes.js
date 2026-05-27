import { Router } from 'express';
import {
  getCurrentUser,
  registerStudent,
  updateCurrentUser,
} from '../controllers/auth.controller.js';
import { authenticate, requireProfile } from '../middleware/auth.js';

const router = Router();

router.get('/me', authenticate, getCurrentUser);
router.post('/register', authenticate, registerStudent);
router.patch('/me', authenticate, requireProfile, updateCurrentUser);

export default router;
