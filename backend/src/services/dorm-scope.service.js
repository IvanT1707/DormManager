import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { HttpError } from '../utils/http-error.js';

export function hasGlobalDormAccess(user) {
  return user.role === ROLES.ADMINISTRATOR;
}

export function hasAssignedDormScope(user) {
  return [ROLES.COMMANDANT, ROLES.MAINTENANCE_STAFF].includes(user.role);
}

export function addAssignedDormFilter(filters, values, user, dormColumn) {
  if (!hasAssignedDormScope(user)) {
    return;
  }

  values.push(user.id);
  filters.push(
    `EXISTS (
      SELECT 1 FROM staff_dorm_assignment AS scope
      WHERE scope.user_id = $${values.length}
        AND scope.dorm_id = ${dormColumn}
        AND scope.active = TRUE
    )`,
  );
}

export async function getManagedDormIds(userId, client = pool) {
  const result = await client.query(
    `SELECT dorm_id AS "dormId"
     FROM staff_dorm_assignment
     WHERE user_id = $1 AND active = TRUE
     ORDER BY dorm_id`,
    [userId],
  );
  return result.rows.map((row) => String(row.dormId));
}

export async function assertCanManageDorm(user, dormId, client = pool) {
  if (hasGlobalDormAccess(user)) {
    return;
  }

  if (!hasAssignedDormScope(user)) {
    throw new HttpError(403, 'You do not have access to manage dormitory data.');
  }

  const result = await client.query(
    `SELECT id FROM staff_dorm_assignment
     WHERE user_id = $1 AND dorm_id = $2 AND active = TRUE`,
    [user.id, dormId],
  );

  if (result.rowCount === 0) {
    throw new HttpError(403, 'This dormitory is outside your assigned scope.');
  }
}

export async function getRoomDormId(roomId, client = pool) {
  const result = await client.query('SELECT dorm_id AS "dormId" FROM room WHERE id = $1', [roomId]);

  if (result.rowCount === 0) {
    throw new HttpError(404, 'Room was not found.');
  }

  return String(result.rows[0].dormId);
}

export async function assertCanManageRoom(user, roomId, client = pool) {
  const dormId = await getRoomDormId(roomId, client);
  await assertCanManageDorm(user, dormId, client);
  return dormId;
}

export async function assertCanManageResidence(user, residenceId, client = pool) {
  const result = await client.query(
    `SELECT room.dorm_id AS "dormId"
     FROM residence
     JOIN room ON room.id = residence.room_id
     WHERE residence.id = $1`,
    [residenceId],
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, 'Residence was not found.');
  }

  await assertCanManageDorm(user, result.rows[0].dormId, client);
  return String(result.rows[0].dormId);
}
