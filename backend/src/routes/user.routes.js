import { Router } from 'express';
import {
  activateUser,
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from '../controllers/user.controller.js';
import { ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router
  .route('/')
  .get(authorize(ROLES.COMMANDANT, ROLES.ADMINISTRATOR), listUsers)
  .post(authorize(ROLES.ADMINISTRATOR), createUser);
router
  .route('/:id')
  .get(authorize(ROLES.COMMANDANT, ROLES.ADMINISTRATOR), getUser)
  .patch(authorize(ROLES.ADMINISTRATOR), updateUser)
  .delete(authorize(ROLES.ADMINISTRATOR), deleteUser);
router.post('/:id/activate', authorize(ROLES.ADMINISTRATOR), activateUser);

export default router;
