import { pool } from '../config/database.js';
import { generatePaymentReminders } from '../services/reminder.service.js';
import { notificationColumns, subscribeToNotifications } from '../services/notification.service.js';
import { rowOrNotFound } from '../utils/controller-helpers.js';
import { readId } from '../utils/validation.js';

export async function listNotifications(request, response) {
  const result = await pool.query(
    `SELECT ${notificationColumns()}
     FROM notification
     WHERE recipient_user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [request.user.id],
  );
  response.json(result.rows);
}

export async function unreadNotificationCount(request, response) {
  const result = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM notification
     WHERE recipient_user_id = $1 AND read_at IS NULL`,
    [request.user.id],
  );
  response.json({ count: result.rows[0].count });
}

export async function readNotification(request, response) {
  const id = readId(request.params.id);
  const result = await pool.query(
    `UPDATE notification
     SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id = $1 AND recipient_user_id = $2
     RETURNING ${notificationColumns()}`,
    [id, request.user.id],
  );
  response.json(rowOrNotFound(result, 'Notification'));
}

export async function readAllNotifications(request, response) {
  const result = await pool.query(
    `UPDATE notification SET read_at = CURRENT_TIMESTAMP
     WHERE recipient_user_id = $1 AND read_at IS NULL`,
    [request.user.id],
  );
  response.json({ updatedCount: result.rowCount });
}

export function streamNotifications(request, response) {
  response.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  response.flushHeaders();
  response.write(`event: connected\ndata: {"connected":true}\n\n`);

  const unsubscribe = subscribeToNotifications(request.user.id, response);
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 25000);

  request.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

export async function triggerPaymentReminders(_request, response) {
  const result = await generatePaymentReminders();
  response.json(result);
}
