import { Router } from 'express';
import {
  createService,
  deleteService,
  getService,
  listServices,
  updateService,
} from '../controllers/service.controller.js';
import { ALL_ROLES, ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router
  .route('/')
  .get(authorize(...ALL_ROLES), listServices)
  .post(authorize(ROLES.ADMINISTRATOR), createService);
router
  .route('/:id')
  .get(authorize(...ALL_ROLES), getService)
  .patch(authorize(ROLES.ADMINISTRATOR), updateService)
  .delete(authorize(ROLES.ADMINISTRATOR), deleteService);

export default router;
