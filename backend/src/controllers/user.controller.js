import { pool } from '../config/database.js';
import { createFirebaseAccount, deleteFirebaseAccount } from '../config/firebase.js';
import { ALL_ROLES, ROLES } from '../constants/roles.js';
import { addFilter, rowOrNotFound, updateStatement, whereClause } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import {
  readEmail,
  readEnum,
  readId,
  readString,
  requireJsonObject,
} from '../utils/validation.js';

const COLUMNS =
  'id, firebase_uid AS "firebaseUid", email, role, full_name AS "fullName", faculty, specialty, maintenance_specialization AS "maintenanceSpecialization", created_at AS "createdAt", updated_at AS "updatedAt"';
const MAINTENANCE_SPECIALIZATIONS = ['general', 'electrician', 'plumber'];

export async function listUsers(request, response) {
  const filters = [];
  const values = [];
  const role =
    request.query.role === undefined
      ? undefined
      : readEnum({ role: request.query.role }, 'role', ALL_ROLES);
  addFilter(filters, values, 'role', role);
  if (request.user.role === ROLES.COMMANDANT) {
    values.push(request.user.id);
    filters.push(
      `(users.id = $${values.length}
        OR (
          users.role = 'student'
          AND (
            EXISTS (
              SELECT 1 FROM residence
              JOIN room ON room.id = residence.room_id
              JOIN staff_dorm_assignment AS scope
                ON scope.dorm_id = room.dorm_id
               AND scope.user_id = $${values.length} AND scope.active = TRUE
              WHERE residence.user_id = users.id
            )
            OR EXISTS (
              SELECT 1 FROM application
              JOIN staff_dorm_assignment AS scope
                ON scope.dorm_id = application.managed_dorm_id
               AND scope.user_id = $${values.length} AND scope.active = TRUE
              WHERE application.user_id = users.id
            )
          )
        ))`,
    );
  }
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM users${whereClause(filters)} ORDER BY full_name`,
    values,
  );
  response.json(result.rows);
}

export async function getUser(request, response) {
  const id = readId(request.params.id);
  const filters = ['users.id = $1'];
  const values = [id];
  if (request.user.role === ROLES.COMMANDANT) {
    values.push(request.user.id);
    filters.push(
      `(users.id = $${values.length}
        OR (
          users.role = 'student'
          AND (
            EXISTS (
              SELECT 1 FROM residence
              JOIN room ON room.id = residence.room_id
              JOIN staff_dorm_assignment AS scope
                ON scope.dorm_id = room.dorm_id
               AND scope.user_id = $${values.length} AND scope.active = TRUE
              WHERE residence.user_id = users.id
            )
            OR EXISTS (
              SELECT 1 FROM application
              JOIN staff_dorm_assignment AS scope
                ON scope.dorm_id = application.managed_dorm_id
               AND scope.user_id = $${values.length} AND scope.active = TRUE
              WHERE application.user_id = users.id
            )
          )
        ))`,
    );
  }
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM users WHERE ${filters.join(' AND ')}`,
    values,
  );
  response.json(rowOrNotFound(result, 'User'));
}

export async function createUser(request, response) {
  requireJsonObject(request.body);
  const email = readEmail(request.body, 'email', { required: true });
  const password = readString(request.body, 'password', { required: true, maxLength: 128 });
  const role = readEnum(request.body, 'role', ALL_ROLES) ?? 'student';
  const fullName = readString(request.body, 'fullName', {
    required: true,
    maxLength: 255,
  });
  const faculty = readString(request.body, 'faculty', { nullable: true, maxLength: 255 });
  const specialty = readString(request.body, 'specialty', { nullable: true, maxLength: 255 });
  const maintenanceSpecialization =
    role === ROLES.MAINTENANCE_STAFF
      ? readEnum(request.body, 'maintenanceSpecialization', MAINTENANCE_SPECIALIZATIONS) ?? 'general'
      : null;

  if (password.length < 6) {
    throw new HttpError(400, 'password must contain at least 6 characters.');
  }

  const firebaseAccount = await createFirebaseAccount({ email, password, displayName: fullName });

  try {
    const result = await pool.query(
      `INSERT INTO users (firebase_uid, email, role, full_name, faculty, specialty, maintenance_specialization)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
      [firebaseAccount.uid, email, role, fullName, faculty ?? null, specialty ?? null, maintenanceSpecialization],
    );
    response.status(201).json(result.rows[0]);
  } catch (error) {
    try {
      await deleteFirebaseAccount(firebaseAccount.uid);
    } catch (cleanupError) {
      console.error('Unable to remove Firebase account after profile creation failed.', cleanupError);
    }
    throw error;
  }
}

export async function updateUser(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const current = rowOrNotFound(
    await pool.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]),
    'User',
  );
  const role = readEnum(request.body, 'role', ALL_ROLES);
  const resultingRole = role ?? current.role;
  const submittedSpecialization = readEnum(
    request.body,
    'maintenanceSpecialization',
    MAINTENANCE_SPECIALIZATIONS,
  );
  const maintenanceSpecialization =
    resultingRole === ROLES.MAINTENANCE_STAFF
      ? submittedSpecialization ?? current.maintenanceSpecialization ?? 'general'
      : null;
  const query = updateStatement(
    'users',
    id,
    {
      role,
      fullName: readString(request.body, 'fullName', { maxLength: 255 }),
      faculty: readString(request.body, 'faculty', { nullable: true, maxLength: 255 }),
      specialty: readString(request.body, 'specialty', { nullable: true, maxLength: 255 }),
      maintenanceSpecialization,
    },
    {
      role: 'role',
      fullName: 'full_name',
      faculty: 'faculty',
      specialty: 'specialty',
      maintenanceSpecialization: 'maintenance_specialization',
    },
    COLUMNS,
  );
  const result = await pool.query(query);
  response.json(rowOrNotFound(result, 'User'));
}

export async function activateUser(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const password = readString(request.body, 'password', { required: true, maxLength: 128 });

  if (password.length < 6) {
    throw new HttpError(400, 'password must contain at least 6 characters.');
  }

  const client = await pool.connect();
  let firebaseAccount;

  try {
    await client.query('BEGIN');
    const existingResult = await client.query(`SELECT ${COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [
      id,
    ]);
    const user = rowOrNotFound(existingResult, 'User');

    if (user.firebaseUid) {
      throw new HttpError(409, 'This user already has an authentication account.');
    }

    firebaseAccount = await createFirebaseAccount({
      email: user.email,
      password,
      displayName: user.fullName,
    });

    const result = await client.query(
      `UPDATE users
       SET firebase_uid = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING ${COLUMNS}`,
      [firebaseAccount.uid, id],
    );

    await client.query('COMMIT');
    response.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');

    if (firebaseAccount) {
      try {
        await deleteFirebaseAccount(firebaseAccount.uid);
      } catch (cleanupError) {
        console.error('Unable to remove Firebase account after activation failed.', cleanupError);
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function deleteUser(request, response) {
  const id = readId(request.params.id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(`DELETE FROM users WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
    const user = rowOrNotFound(result, 'User');

    await deleteFirebaseAccount(user.firebaseUid);
    await client.query('COMMIT');
    response.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
