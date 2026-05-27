import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { addAssignedDormFilter } from '../services/dorm-scope.service.js';
import { HttpError } from '../utils/http-error.js';
import {
  addFilter,
  rowOrNotFound,
  updateStatement,
  whereClause,
} from '../utils/controller-helpers.js';
import {
  assertDateRange,
  readDate,
  readEnum,
  readForeignId,
  readId,
  requireJsonObject,
} from '../utils/validation.js';

const STATUSES = ['active', 'archived'];
const COLUMNS =
  'residence.id, residence.user_id AS "userId", residence.room_id AS "roomId", residence.start_date AS "startDate", residence.end_date AS "endDate", residence.status, residence.created_at AS "createdAt", residence.updated_at AS "updatedAt"';

function assertLifecycle(startDate, endDate, status) {
  assertDateRange(startDate, endDate);

  if (status === 'archived' && !endDate) {
    throw new HttpError(400, 'endDate is required when residence status is archived.');
  }
}

async function assertAvailableCapacity(client, roomId, excludedResidenceId = null) {
  const roomResult = await client.query(
    'SELECT capacity FROM room WHERE id = $1 FOR UPDATE',
    [roomId],
  );

  if (roomResult.rowCount === 0) {
    throw new HttpError(404, 'Room was not found.');
  }

  const occupiedResult = await client.query(
    `SELECT COUNT(*)::integer AS occupied
     FROM residence
     WHERE room_id = $1 AND status = 'active' AND ($2::bigint IS NULL OR id <> $2::bigint)`,
    [roomId, excludedResidenceId],
  );

  if (occupiedResult.rows[0].occupied >= roomResult.rows[0].capacity) {
    throw new HttpError(409, 'Room has no available places for an active residence.');
  }
}

export async function listResidences(request, response) {
  const filters = [];
  const values = [];
  const userId = request.query.userId === undefined ? undefined : readId(request.query.userId, 'userId');
  const roomId = request.query.roomId === undefined ? undefined : readId(request.query.roomId, 'roomId');
  const status =
    request.query.status === undefined
      ? undefined
      : readEnum({ status: request.query.status }, 'status', STATUSES);
  addFilter(filters, values, 'residence.user_id', userId);
  addFilter(filters, values, 'residence.room_id', roomId);
  addFilter(filters, values, 'residence.status', status);
  if (request.user.role === ROLES.STUDENT) {
    addFilter(filters, values, 'residence.user_id', String(request.user.id));
  }
  addAssignedDormFilter(filters, values, request.user, 'room.dorm_id');
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM residence
     JOIN room ON room.id = residence.room_id${whereClause(filters)}
     ORDER BY residence.start_date DESC, residence.id DESC`,
    values,
  );
  response.json(result.rows);
}

export async function getResidence(request, response) {
  const id = readId(request.params.id);
  const filters = ['residence.id = $1'];
  const values = [id];
  if (request.user.role === ROLES.STUDENT) {
    addFilter(filters, values, 'residence.user_id', String(request.user.id));
  }
  addAssignedDormFilter(filters, values, request.user, 'room.dorm_id');
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM residence JOIN room ON room.id = residence.room_id
     WHERE ${filters.join(' AND ')}`,
    values,
  );
  response.json(rowOrNotFound(result, 'Residence'));
}

export async function createResidence(request, response) {
  requireJsonObject(request.body);
  const userId = readForeignId(request.body, 'userId', { required: true });
  const roomId = readForeignId(request.body, 'roomId', { required: true });
  const startDate = readDate(request.body, 'startDate', { required: true });
  const endDate = readDate(request.body, 'endDate', { nullable: true });
  const status = readEnum(request.body, 'status', STATUSES) ?? 'active';
  assertLifecycle(startDate, endDate ?? null, status);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (status === 'active') {
      await assertAvailableCapacity(client, roomId);
    }
    const result = await client.query(
      `INSERT INTO residence (user_id, room_id, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [userId, roomId, startDate, endDate ?? null, status],
    );
    await client.query('COMMIT');
    response.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateResidence(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const current = rowOrNotFound(
      await client.query(`SELECT ${COLUMNS} FROM residence WHERE id = $1 FOR UPDATE`, [id]),
      'Residence',
    );
    const fields = {
      userId: readForeignId(request.body, 'userId'),
      roomId: readForeignId(request.body, 'roomId'),
      startDate: readDate(request.body, 'startDate'),
      endDate: readDate(request.body, 'endDate', { nullable: true }),
      status: readEnum(request.body, 'status', STATUSES),
    };
    const resultingStartDate = fields.startDate ?? current.startDate;
    const resultingEndDate = fields.endDate === undefined ? current.endDate : fields.endDate;
    const resultingStatus = fields.status ?? current.status;
    const resultingRoomId = fields.roomId ?? current.roomId;
    assertLifecycle(resultingStartDate, resultingEndDate, resultingStatus);

    if (resultingStatus === 'active') {
      await assertAvailableCapacity(client, resultingRoomId, id);
    }

    const query = updateStatement(
      'residence',
      id,
      fields,
      {
        userId: 'user_id',
        roomId: 'room_id',
        startDate: 'start_date',
        endDate: 'end_date',
        status: 'status',
      },
      COLUMNS,
    );
    const result = await client.query(query);
    await client.query('COMMIT');
    response.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteResidence(request, response) {
  const id = readId(request.params.id);
  const result = await pool.query(`DELETE FROM residence WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  rowOrNotFound(result, 'Residence');
  response.status(204).send();
}
