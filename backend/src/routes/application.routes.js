import { Router } from 'express';
import {
  assignApplicationDorm,
  createApplicationComment,
  createApplication,
  deleteApplication,
  getApplication,
  listApplicationComments,
  listApplications,
  updateApplication,
} from '../controllers/application.controller.js';
import { MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router
  .route('/')
  .get(authorize(ROLES.STUDENT, ROLES.MAINTENANCE_STAFF, ...MANAGEMENT_ROLES), listApplications)
  .post(authorize(ROLES.STUDENT, ...MANAGEMENT_ROLES), createApplication);
router.patch('/:id/managed-dorm', authorize(ROLES.ADMINISTRATOR), assignApplicationDorm);
router
  .route('/:id/comments')
  .get(authorize(ROLES.STUDENT, ROLES.MAINTENANCE_STAFF, ...MANAGEMENT_ROLES), listApplicationComments)
  .post(authorize(ROLES.STUDENT, ROLES.MAINTENANCE_STAFF, ...MANAGEMENT_ROLES), createApplicationComment);
router
  .route('/:id')
  .get(authorize(ROLES.STUDENT, ROLES.MAINTENANCE_STAFF, ...MANAGEMENT_ROLES), getApplication)
  .patch(authorize(ROLES.MAINTENANCE_STAFF, ...MANAGEMENT_ROLES), updateApplication)
  .delete(authorize(ROLES.ADMINISTRATOR), deleteApplication);

export default router;
