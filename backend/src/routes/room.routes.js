import { Router } from 'express';
import {
  createRoom,
  deleteRoom,
  getRoom,
  listRooms,
  updateRoom,
} from '../controllers/room.controller.js';
import { ALL_ROLES, MANAGEMENT_ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router
  .route('/')
  .get(authorize(...ALL_ROLES), listRooms)
  .post(authorize(...MANAGEMENT_ROLES), createRoom);
router
  .route('/:id')
  .get(authorize(...ALL_ROLES), getRoom)
  .patch(authorize(...MANAGEMENT_ROLES), updateRoom)
  .delete(authorize(...MANAGEMENT_ROLES), deleteRoom);

export default router;
