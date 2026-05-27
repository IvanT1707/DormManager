import { Router } from 'express';
import {
  getInternetStatus,
  listInternetStatuses,
  updateInternetStatus,
} from '../controllers/internet.controller.js';
import { ALL_ROLES, MANAGEMENT_ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router.get('/', authorize(...ALL_ROLES), listInternetStatuses);
router.get('/:id', authorize(...ALL_ROLES), getInternetStatus);
router.put('/:id', authorize(...MANAGEMENT_ROLES), updateInternetStatus);

export default router;
