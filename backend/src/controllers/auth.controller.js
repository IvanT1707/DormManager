import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { rowOrNotFound, updateStatement } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import { readString, requireJsonObject } from '../utils/validation.js';

const PROFILE_COLUMNS =
  'id, firebase_uid AS "firebaseUid", email, role, full_name AS "fullName", faculty, specialty, maintenance_specialization AS "maintenanceSpecialization", created_at AS "createdAt", updated_at AS "updatedAt"';

export async function getCurrentUser(request, response) {
  const result = await pool.query(`SELECT ${PROFILE_COLUMNS} FROM users WHERE firebase_uid = $1`, [
    request.auth.uid,
  ]);

  response.json({
    firebaseUid: request.auth.uid,
    email: request.auth.email,
    profile: result.rows[0] ?? null,
  });
}

export async function registerStudent(request, response) {
  requireJsonObject(request.body);

  if (!request.auth.email) {
    throw new HttpError(400, 'The Firebase account must provide an email address.');
  }

  const fullName = readString(request.body, 'fullName', {
    required: true,
    maxLength: 255,
  });
  const faculty = readString(request.body, 'faculty', { nullable: true, maxLength: 255 });
  const specialty = readString(request.body, 'specialty', { nullable: true, maxLength: 255 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const linkedProfile = await client.query(
      'SELECT id FROM users WHERE firebase_uid = $1 FOR UPDATE',
      [request.auth.uid],
    );

    if (linkedProfile.rowCount > 0) {
      throw new HttpError(409, 'This Firebase account already has a DormManager profile.');
    }

    const existingEmailProfile = await client.query(
      'SELECT id, firebase_uid AS "firebaseUid", role FROM users WHERE email = $1 FOR UPDATE',
      [request.auth.email],
    );
    let result;

    if (existingEmailProfile.rowCount > 0) {
      const existing = existingEmailProfile.rows[0];

      if (existing.firebaseUid && existing.firebaseUid !== request.auth.uid) {
        throw new HttpError(409, 'This email is already linked to another Firebase account.');
      }

      if (existing.role !== ROLES.STUDENT) {
        throw new HttpError(403, 'Staff accounts must be linked by an administrator.');
      }

      result = await client.query(
        `UPDATE users
         SET firebase_uid = $1, full_name = $2, faculty = $3, specialty = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 RETURNING ${PROFILE_COLUMNS}`,
        [request.auth.uid, fullName, faculty ?? null, specialty ?? null, existing.id],
      );
    } else {
      result = await client.query(
        `INSERT INTO users (firebase_uid, email, role, full_name, faculty, specialty)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${PROFILE_COLUMNS}`,
        [
          request.auth.uid,
          request.auth.email,
          ROLES.STUDENT,
          fullName,
          faculty ?? null,
          specialty ?? null,
        ],
      );
    }

    await client.query('COMMIT');
    response.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCurrentUser(request, response) {
  requireJsonObject(request.body);
  const query = updateStatement(
    'users',
    request.user.id,
    {
      fullName: readString(request.body, 'fullName', { maxLength: 255 }),
      faculty: readString(request.body, 'faculty', { nullable: true, maxLength: 255 }),
      specialty: readString(request.body, 'specialty', { nullable: true, maxLength: 255 }),
    },
    { fullName: 'full_name', faculty: 'faculty', specialty: 'specialty' },
    PROFILE_COLUMNS,
  );
  const result = await pool.query(query);
  response.json(rowOrNotFound(result, 'User'));
}
