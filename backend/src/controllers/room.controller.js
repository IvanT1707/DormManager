import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { addAssignedDormFilter, assertCanManageDorm, assertCanManageRoom } from '../services/dorm-scope.service.js';
import {
  addFilter,
  rowOrNotFound,
  updateStatement,
  whereClause,
} from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import {
  readForeignId,
  readId,
  readPositiveInteger,
  readString,
  requireJsonObject,
} from '../utils/validation.js';

const COLUMNS =
  'id, dorm_id AS "dormId", room_number AS "roomNumber", capacity, floor_number AS "floorNumber", block_number AS "blockNumber", room_in_block AS "roomInBlock", created_at AS "createdAt", updated_at AS "updatedAt"';

export async function listRooms(request, response) {
  const filters = [];
  const values = [];
  const dormId = request.query.dormId === undefined ? undefined : readId(request.query.dormId, 'dormId');
  const floorNumber =
    request.query.floorNumber === undefined
      ? undefined
      : readId(request.query.floorNumber, 'floorNumber');
  addFilter(filters, values, 'room.dorm_id', dormId);
  addFilter(filters, values, 'room.floor_number', floorNumber);
  if (request.user.role === ROLES.STUDENT) {
    values.push(request.user.id);
    filters.push(
      `(EXISTS (
          SELECT 1 FROM residence
          WHERE residence.user_id = $${values.length}
            AND residence.room_id = room.id AND residence.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM application
          WHERE application.user_id = $${values.length}
            AND application.assigned_room_id = room.id
            AND application.application_type = 'settlement'
            AND application.status = 'approved'
        ))`,
    );
  }
  addAssignedDormFilter(filters, values, request.user, 'room.dorm_id');
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM room${whereClause(filters)}
     ORDER BY dorm_id, floor_number NULLS LAST, block_number NULLS LAST, room_in_block NULLS LAST, room_number`,
    values,
  );
  response.json(result.rows);
}

export async function getRoom(request, response) {
  const id = readId(request.params.id);
  const filters = ['room.id = $1'];
  const values = [id];
  if (request.user.role === ROLES.STUDENT) {
    values.push(request.user.id);
    filters.push(
      `(EXISTS (
          SELECT 1 FROM residence
          WHERE residence.user_id = $${values.length}
            AND residence.room_id = room.id AND residence.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM application
          WHERE application.user_id = $${values.length}
            AND application.assigned_room_id = room.id
            AND application.application_type = 'settlement'
            AND application.status = 'approved'
        ))`,
    );
  }
  addAssignedDormFilter(filters, values, request.user, 'room.dorm_id');
  const result = await pool.query(`SELECT ${COLUMNS} FROM room WHERE ${filters.join(' AND ')}`, values);
  response.json(rowOrNotFound(result, 'Room'));
}

export async function createRoom(request, response) {
  requireJsonObject(request.body);
  const dormId = readForeignId(request.body, 'dormId', { required: true });
  const roomNumber = readString(request.body, 'roomNumber', {
    required: true,
    maxLength: 20,
  });
  const capacity = readPositiveInteger(request.body, 'capacity', { required: true });
  const floorNumber = readPositiveInteger(request.body, 'floorNumber');
  const blockNumber = readPositiveInteger(request.body, 'blockNumber');
  const roomInBlock = readPositiveInteger(request.body, 'roomInBlock');
  const hasBlockPlacement = blockNumber !== undefined || roomInBlock !== undefined;
  if (hasBlockPlacement && (!floorNumber || !blockNumber || !roomInBlock)) {
    throw new HttpError(400, 'floorNumber, blockNumber, and roomInBlock must be provided together for a block room.');
  }
  await assertCanManageDorm(request.user, dormId);

  const result = await pool.query(
    `INSERT INTO room (dorm_id, room_number, capacity, floor_number, block_number, room_in_block)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
    [dormId, roomNumber, capacity, floorNumber ?? null, blockNumber ?? null, roomInBlock ?? null],
  );
  response.status(201).json(result.rows[0]);
}

export async function updateRoom(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  await assertCanManageRoom(request.user, id);
  const capacity = readPositiveInteger(request.body, 'capacity');
  const dormId = readForeignId(request.body, 'dormId');
  if (dormId) {
    await assertCanManageDorm(request.user, dormId);
  }
  const query = updateStatement(
    'room',
    id,
    {
      dormId,
      roomNumber: readString(request.body, 'roomNumber', { maxLength: 20 }),
      capacity,
      floorNumber: readPositiveInteger(request.body, 'floorNumber'),
      blockNumber: readPositiveInteger(request.body, 'blockNumber'),
      roomInBlock: readPositiveInteger(request.body, 'roomInBlock'),
    },
    {
      dormId: 'dorm_id',
      roomNumber: 'room_number',
      capacity: 'capacity',
      floorNumber: 'floor_number',
      blockNumber: 'block_number',
      roomInBlock: 'room_in_block',
    },
    COLUMNS,
  );

  if (capacity === undefined) {
    const result = await pool.query(query);
    response.json(rowOrNotFound(result, 'Room'));
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    rowOrNotFound(
      await client.query(`SELECT ${COLUMNS} FROM room WHERE id = $1 FOR UPDATE`, [id]),
      'Room',
    );
    const occupants = await client.query(
      `SELECT COUNT(*)::integer AS occupied
       FROM residence
       WHERE room_id = $1 AND status = 'active'`,
      [id],
    );

    if (occupants.rows[0].occupied > capacity) {
      throw new HttpError(409, 'Room capacity cannot be lower than its active occupancy.');
    }

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

export async function deleteRoom(request, response) {
  const id = readId(request.params.id);
  await assertCanManageRoom(request.user, id);
  const result = await pool.query(`DELETE FROM room WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  rowOrNotFound(result, 'Room');
  response.status(204).send();
}
