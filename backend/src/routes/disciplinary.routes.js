import { Router } from 'express';
import {
  createDisciplinaryRecord,
  createViolationRule,
  getDisciplinaryPolicy,
  listDisciplinaryRecords,
  listViolationRules,
  updateDisciplinaryPolicy,
  updateDisciplinaryRecord,
  updateViolationRule,
} from '../controllers/disciplinary.controller.js';
import { MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router
  .route('/rules')
  .get(authorize(...MANAGEMENT_ROLES), listViolationRules)
  .post(authorize(ROLES.ADMINISTRATOR), createViolationRule);
router.patch('/rules/:id', authorize(ROLES.ADMINISTRATOR), updateViolationRule);
router
  .route('/policy')
  .get(authorize(ROLES.STUDENT, ...MANAGEMENT_ROLES), getDisciplinaryPolicy)
  .patch(authorize(ROLES.ADMINISTRATOR), updateDisciplinaryPolicy);
router
  .route('/')
  .get(authorize(ROLES.STUDENT, ...MANAGEMENT_ROLES), listDisciplinaryRecords)
  .post(authorize(...MANAGEMENT_ROLES), createDisciplinaryRecord);
router.patch('/:id', authorize(...MANAGEMENT_ROLES), updateDisciplinaryRecord);

export default router;
