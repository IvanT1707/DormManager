import { Router } from 'express';
import {
  listNotifications,
  readAllNotifications,
  readNotification,
  streamNotifications,
  triggerPaymentReminders,
  unreadNotificationCount,
} from '../controllers/notification.controller.js';
import { ROLES } from '../constants/roles.js';
import { authorize } from '../middleware/auth.js';

const router = Router();

router.get('/', listNotifications);
router.get('/unread-count', unreadNotificationCount);
router.get('/stream', streamNotifications);
router.post('/generate-reminders', authorize(ROLES.ADMINISTRATOR), triggerPaymentReminders);
router.patch('/read-all', readAllNotifications);
router.patch('/:id/read', readNotification);

export default router;
