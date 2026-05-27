import { Router } from 'express';
import {
  completeSimulatedPayment,
  createSimulatedPayment,
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '../controllers/transaction.controller.js';
import { MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router.post('/simulate', authorize(ROLES.STUDENT), createSimulatedPayment);
router.post(
  '/:id/complete-simulation',
  authorize(ROLES.STUDENT),
  completeSimulatedPayment,
);
router
  .route('/')
  .get(authorize(ROLES.STUDENT, ...MANAGEMENT_ROLES), listTransactions)
  .post(authorize(...MANAGEMENT_ROLES), createTransaction);
router
  .route('/:id')
  .get(authorize(ROLES.STUDENT, ...MANAGEMENT_ROLES), getTransaction)
  .patch(authorize(...MANAGEMENT_ROLES), updateTransaction)
  .delete(authorize(ROLES.ADMINISTRATOR), deleteTransaction);

export default router;
