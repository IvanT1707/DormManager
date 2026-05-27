import { Router } from 'express';
import {
  createResidence,
  deleteResidence,
  getResidence,
  listResidences,
  updateResidence,
} from '../controllers/residence.controller.js';
import { MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router
  .route('/')
  .get(authorize(ROLES.STUDENT, ...MANAGEMENT_ROLES), listResidences)
  .post(authorize(ROLES.ADMINISTRATOR), createResidence);
router
  .route('/:id')
  .get(authorize(ROLES.STUDENT, ...MANAGEMENT_ROLES), getResidence)
  .patch(authorize(ROLES.ADMINISTRATOR), updateResidence)
  .delete(authorize(ROLES.ADMINISTRATOR), deleteResidence);

export default router;
