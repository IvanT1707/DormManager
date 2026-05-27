import { Router } from 'express';
import {
  createDorm,
  deleteDorm,
  generateRoomsFromLayout,
  getDorm,
  getOccupancyLayout,
  listDorms,
  updateDorm,
} from '../controllers/dorm.controller.js';
import { ALL_ROLES, MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router
  .route('/')
  .get(authorize(...ALL_ROLES), listDorms)
  .post(authorize(ROLES.ADMINISTRATOR), createDorm);
router
  .route('/:id')
  .get(authorize(...ALL_ROLES), getDorm)
  .patch(authorize(ROLES.ADMINISTRATOR), updateDorm)
  .delete(authorize(ROLES.ADMINISTRATOR), deleteDorm);
router.get('/:id/occupancy-layout', authorize(...MANAGEMENT_ROLES), getOccupancyLayout);
router.post('/:id/generate-rooms', authorize(ROLES.ADMINISTRATOR), generateRoomsFromLayout);

export default router;
