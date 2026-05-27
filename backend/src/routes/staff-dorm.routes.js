import { Router } from 'express';
import {
  createStaffDormAssignment,
  endStaffDormAssignment,
  listStaffDormAssignments,
} from '../controllers/staff-dorm.controller.js';
import { ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  authorize(ROLES.COMMANDANT, ROLES.MAINTENANCE_STAFF, ROLES.ADMINISTRATOR),
  listStaffDormAssignments,
);
router.post('/', authorize(ROLES.ADMINISTRATOR), createStaffDormAssignment);
router.delete('/:id', authorize(ROLES.ADMINISTRATOR), endStaffDormAssignment);

export default router;
