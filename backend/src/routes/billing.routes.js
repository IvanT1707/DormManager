import { Router } from 'express';
import {
  createBillingPeriod,
  createPeriodCharges,
  listBillingPeriods,
  listCharges,
  runScheduledBilling,
  updateBillingPeriod,
} from '../controllers/billing.controller.js';
import { ALL_ROLES, ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router.get('/', authorize(...ALL_ROLES), listCharges);
router.post('/generate', authorize(ROLES.ADMINISTRATOR), createPeriodCharges);
router.get('/billing-periods', authorize(ROLES.COMMANDANT, ROLES.ADMINISTRATOR), listBillingPeriods);
router.post('/billing-periods', authorize(ROLES.ADMINISTRATOR), createBillingPeriod);
router.patch('/billing-periods/:id', authorize(ROLES.ADMINISTRATOR), updateBillingPeriod);
router.post('/run-scheduled', authorize(ROLES.ADMINISTRATOR), runScheduledBilling);

export default router;
