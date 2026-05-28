import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { addAssignedDormFilter, assertCanManageRoom } from '../services/dorm-scope.service.js';
import { createNotification } from '../services/notification.service.js';
import { rowOrNotFound, whereClause } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import { readDate, readEnum, readForeignId, readId, requireJsonObject } from '../utils/validation.js';

const SUBSCRIPTION_STATUSES = ['inactive', 'active', 'suspended'];
const INTERNET_SELECT =
  `room.id AS "roomId", room.dorm_id AS "dormId",
   room.internet_service_id AS "serviceId", room.internet_status AS "subscriptionStatus",
   room.internet_activated_at AS "activatedAt", room.internet_suspended_at AS "suspendedAt",
   CASE
     WHEN room.internet_service_id IS NULL OR room.internet_status = 'inactive' THEN 'not_connected'
     WHEN room.internet_status = 'suspended' THEN 'suspended'
     WHEN EXISTS (
       SELECT 1 FROM billing_charge AS charge
       JOIN service ON service.id = charge.service_id
       WHERE charge.room_id = room.id
         AND service.service_code = 'INTERNET'
         AND charge.period_start <= CURRENT_DATE
         AND charge.period_end >= CURRENT_DATE
         AND charge.status = 'paid'
     ) THEN 'active_paid'
     ELSE 'payment_due'
   END AS "internetStatus"`;

function accessFilters(request, roomColumn = 'room.id', dormColumn = 'room.dorm_id') {
  const filters = [];
  const values = [];

  if (request.user.role === ROLES.STUDENT) {
    values.push(request.user.id);
    filters.push(
      `EXISTS (SELECT 1 FROM residence WHERE residence.user_id = $${values.length}
       AND residence.room_id = ${roomColumn} AND residence.status = 'active')`,
    );
  }

  addAssignedDormFilter(filters, values, request.user, dormColumn);
  return { filters, values };
}

export async function listInternetStatuses(request, response) {
  const { filters, values } = accessFilters(request);
  if (request.query.dormId !== undefined) {
    values.push(readId(request.query.dormId, 'dormId'));
    filters.push(`room.dorm_id = $${values.length}`);
  }
  const result = await pool.query(
    `SELECT ${INTERNET_SELECT}
     FROM room
     ${whereClause(filters)}
     ORDER BY room.dorm_id, room.room_number`,
    values,
  );
  response.json(result.rows);
}

export async function getInternetStatus(request, response) {
  const id = readId(request.params.id);
  const { filters, values } = accessFilters(request);
  values.unshift(id);
  const shiftedFilters = filters.map((filter) =>
    filter.replace(/\$(\d+)/g, (_match, number) => `$${Number(number) + 1}`),
  );
  shiftedFilters.unshift('room.id = $1');
  const result = await pool.query(
    `SELECT ${INTERNET_SELECT}
     FROM room
     WHERE ${shiftedFilters.join(' AND ')}`,
    values,
  );
  response.json(rowOrNotFound(result, 'Room internet status'));
}

export async function updateInternetStatus(request, response) {
  const roomId = readId(request.params.id);
  requireJsonObject(request.body);
  await assertCanManageRoom(request.user, roomId);
  const serviceId = readForeignId(request.body, 'serviceId', { required: true });
  const status = readEnum(request.body, 'status', SUBSCRIPTION_STATUSES, { required: true });
  const activatedAt = readDate(request.body, 'activatedAt', { nullable: true });
  const suspendedAt = readDate(request.body, 'suspendedAt', { nullable: true });
  const service = await pool.query(
    `SELECT id FROM service WHERE id = $1 AND service_code = 'INTERNET' AND active = TRUE`,
    [serviceId],
  );
  if (service.rowCount === 0) {
    throw new HttpError(400, 'An active INTERNET service is required for a room subscription.');
  }

  const result = await pool.query(
    `UPDATE room
     SET internet_service_id = $2,
         internet_status = $3::room_service_status,
         internet_activated_at = $4,
         internet_suspended_at = $5,
         internet_updated_by = $6,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id AS "roomId", internet_service_id AS "serviceId",
               internet_status AS "subscriptionStatus",
               internet_activated_at AS "activatedAt",
               internet_suspended_at AS "suspendedAt"`,
    [roomId, serviceId, status, activatedAt ?? null, suspendedAt ?? null, request.user.id],
  );

  if (status === 'suspended') {
    const residents = await pool.query(
      `SELECT user_id AS "userId" FROM residence WHERE room_id = $1 AND status = 'active'`,
      [roomId],
    );
    await Promise.all(
      residents.rows.map((resident) =>
        createNotification({
          recipientUserId: resident.userId,
          notificationType: 'internet_status',
          priority: 'warning',
          title: 'Статус інтернету змінено',
          message: 'Підключення інтернету у вашій кімнаті призупинено.',
          relatedEntityType: 'room',
          relatedEntityId: roomId,
          deduplicationKey: `room:${roomId}:internet-suspended:${resident.userId}:${Date.now()}`,
        }),
      ),
    );
  }

  response.json(result.rows[0]);
}
