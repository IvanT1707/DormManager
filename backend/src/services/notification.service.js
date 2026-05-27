import { pool } from '../config/database.js';

const COLUMNS =
  'id, recipient_user_id AS "recipientUserId", notification_type AS "notificationType", priority, title, message, related_entity_type AS "relatedEntityType", related_entity_id AS "relatedEntityId", payload, deduplication_key AS "deduplicationKey", read_at AS "readAt", expires_at AS "expiresAt", created_at AS "createdAt"';
const subscribers = new Map();

export function notificationColumns() {
  return COLUMNS;
}

export function publishNotification(notification) {
  if (!notification) {
    return;
  }

  const listeners = subscribers.get(String(notification.recipientUserId)) ?? new Set();
  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;

  for (const response of listeners) {
    response.write(payload);
  }
}

export async function createNotification(data, options = {}) {
  const client = options.client ?? pool;
  const result = await client.query(
    `INSERT INTO notification
       (recipient_user_id, notification_type, priority, title, message,
        related_entity_type, related_entity_id, payload, deduplication_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     ON CONFLICT (deduplication_key) DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      data.recipientUserId,
      data.notificationType,
      data.priority ?? 'info',
      data.title,
      data.message,
      data.relatedEntityType ?? null,
      data.relatedEntityId ?? null,
      JSON.stringify(data.payload ?? {}),
      data.deduplicationKey,
    ],
  );
  const notification = result.rows[0] ?? null;

  if (notification && options.publish !== false) {
    publishNotification(notification);
  }

  return notification;
}

export function subscribeToNotifications(userId, response) {
  const key = String(userId);
  const listeners = subscribers.get(key) ?? new Set();
  listeners.add(response);
  subscribers.set(key, listeners);

  return () => {
    listeners.delete(response);
    if (listeners.size === 0) {
      subscribers.delete(key);
    }
  };
}
