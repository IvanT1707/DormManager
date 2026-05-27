import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { createNotification } from '../services/notification.service.js';
import { rowOrNotFound } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import { readForeignId, readId, requireJsonObject } from '../utils/validation.js';

const COLUMNS =
  'assignment.id, assignment.user_id AS "userId", assignment.dorm_id AS "dormId", assignment.assigned_by AS "assignedBy", assignment.active, assignment.assigned_at AS "assignedAt", assignment.ended_at AS "endedAt", users.full_name AS "userName", users.role, users.maintenance_specialization AS "maintenanceSpecialization", dorm.dorm_number AS "dormNumber"';

export async function listStaffDormAssignments(request, response) {
  const isAdmin = request.user.role === ROLES.ADMINISTRATOR;
  const result = await pool.query(
    `SELECT ${COLUMNS}
     FROM staff_dorm_assignment AS assignment
     JOIN users ON users.id = assignment.user_id
     JOIN dorm ON dorm.id = assignment.dorm_id
     ${isAdmin ? '' : 'WHERE assignment.user_id = $1'}
     ORDER BY assignment.active DESC, dorm.dorm_number, users.full_name`,
    isAdmin ? [] : [request.user.id],
  );
  response.json(result.rows);
}

export async function createStaffDormAssignment(request, response) {
  requireJsonObject(request.body);
  const userId = readForeignId(request.body, 'userId', { required: true });
  const dormId = readForeignId(request.body, 'dormId', { required: true });
  const user = rowOrNotFound(
    await pool.query('SELECT role FROM users WHERE id = $1', [userId]),
    'User',
  );
  if (![ROLES.COMMANDANT, ROLES.MAINTENANCE_STAFF].includes(user.role)) {
    throw new HttpError(400, 'Only commandants or maintenance staff can be assigned to a dormitory.');
  }
  const result = await pool.query(
    `INSERT INTO staff_dorm_assignment (user_id, dorm_id, assigned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, dorm_id) DO UPDATE SET
       active = TRUE, assigned_by = EXCLUDED.assigned_by, assigned_at = CURRENT_TIMESTAMP,
       ended_at = NULL, updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [userId, dormId, request.user.id],
  );
  const assignment = rowOrNotFound(
    await pool.query(
      `SELECT ${COLUMNS}
       FROM staff_dorm_assignment AS assignment
       JOIN users ON users.id = assignment.user_id
       JOIN dorm ON dorm.id = assignment.dorm_id WHERE assignment.id = $1`,
      [result.rows[0].id],
    ),
    'Assignment',
  );
  await createNotification({
    recipientUserId: userId,
    notificationType: 'staff_assignment',
    title: 'Призначення до гуртожитку',
    message: `Вас призначено відповідальним за гуртожиток ${assignment.dormNumber}.`,
    relatedEntityType: 'staff_dorm_assignment',
    relatedEntityId: assignment.id,
    deduplicationKey: `staff-dorm:${assignment.id}:assigned:${userId}:${assignment.assignedAt}`,
  });
  response.status(201).json(assignment);
}

export async function endStaffDormAssignment(request, response) {
  const id = readId(request.params.id);
  const result = await pool.query(
    `UPDATE staff_dorm_assignment
     SET active = FALSE, ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING id`,
    [id],
  );
  rowOrNotFound(result, 'Assignment');
  response.status(204).send();
}
