import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { addAssignedDormFilter, assertCanManageDorm } from '../services/dorm-scope.service.js';
import { rowOrNotFound, updateStatement, whereClause } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import { readBoolean, readId, readPositiveInteger, readString, requireJsonObject } from '../utils/validation.js';

const COLUMNS =
  'id, dorm_number AS "dormNumber", address, total_floors AS "totalFloors", residential_floor_from AS "residentialFloorFrom", has_blocks AS "hasBlocks", blocks_per_floor AS "blocksPerFloor", rooms_per_block AS "roomsPerBlock", rooms_per_floor AS "roomsPerFloor", default_room_capacity AS "defaultRoomCapacity", created_at AS "createdAt", updated_at AS "updatedAt"';
const ROOM_SUFFIXES = ['а', 'б', 'в', 'г', 'ґ', 'д', 'е', 'є', 'ж', 'з', 'и', 'і', 'ї', 'й', 'к', 'л', 'м', 'н', 'о', 'п', 'р', 'с', 'т', 'у', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ю', 'я'];

export async function listDorms(request, response) {
  const filters = [];
  const values = [];
  if (request.user.role === ROLES.STUDENT) {
    values.push(request.user.id);
    filters.push(
      `(EXISTS (
          SELECT 1 FROM residence JOIN room ON room.id = residence.room_id
          WHERE residence.user_id = $${values.length} AND residence.status = 'active'
            AND room.dorm_id = dorm.id
        )
        OR EXISTS (
          SELECT 1 FROM application
          JOIN room AS assigned_room ON assigned_room.id = application.assigned_room_id
          WHERE application.user_id = $${values.length}
            AND application.application_type = 'settlement'
            AND application.status = 'approved'
            AND assigned_room.dorm_id = dorm.id
        ))`,
    );
  }
  addAssignedDormFilter(filters, values, request.user, 'dorm.id');
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM dorm${whereClause(filters)} ORDER BY dorm_number`,
    values,
  );
  response.json(result.rows);
}

export async function getDorm(request, response) {
  const id = readId(request.params.id);
  const filters = ['id = $1'];
  const values = [id];
  if (request.user.role === ROLES.STUDENT) {
    values.push(request.user.id);
    filters.push(
      `(EXISTS (
          SELECT 1 FROM residence JOIN room ON room.id = residence.room_id
          WHERE residence.user_id = $${values.length} AND residence.status = 'active'
            AND room.dorm_id = dorm.id
        )
        OR EXISTS (
          SELECT 1 FROM application
          JOIN room AS assigned_room ON assigned_room.id = application.assigned_room_id
          WHERE application.user_id = $${values.length}
            AND application.application_type = 'settlement'
            AND application.status = 'approved'
            AND assigned_room.dorm_id = dorm.id
        ))`,
    );
  }
  addAssignedDormFilter(filters, values, request.user, 'dorm.id');
  const result = await pool.query(`SELECT ${COLUMNS} FROM dorm WHERE ${filters.join(' AND ')}`, values);
  response.json(rowOrNotFound(result, 'Dorm'));
}

function summarizeRooms(rooms) {
  return rooms.reduce(
    (totals, room) => ({
      rooms: totals.rooms + 1,
      capacity: totals.capacity + Number(room.capacity),
      occupied: totals.occupied + Number(room.occupied),
      available: totals.available + Number(room.availablePlaces),
    }),
    { rooms: 0, capacity: 0, occupied: 0, available: 0 },
  );
}

export async function getOccupancyLayout(request, response) {
  const id = readId(request.params.id);
  await assertCanManageDorm(request.user, id);
  const dorm = rowOrNotFound(
    await pool.query(`SELECT ${COLUMNS} FROM dorm WHERE id = $1`, [id]),
    'Dorm',
  );
  const result = await pool.query(
    `SELECT room.id, room.dorm_id AS "dormId", room.room_number AS "roomNumber",
            room.capacity, room.floor_number AS "floorNumber",
            room.block_number AS "blockNumber", room.room_in_block AS "roomInBlock",
            COUNT(residence.id)::integer AS occupied,
            COALESCE(
              json_agg(
                json_build_object(
                  'residenceId', residence.id,
                  'userId', users.id,
                  'fullName', users.full_name,
                  'email', users.email
                )
                ORDER BY users.full_name
              ) FILTER (WHERE residence.id IS NOT NULL),
              '[]'::json
            ) AS residents
     FROM room
     LEFT JOIN residence ON residence.room_id = room.id AND residence.status = 'active'
     LEFT JOIN users ON users.id = residence.user_id
     WHERE room.dorm_id = $1
     GROUP BY room.id
     ORDER BY room.floor_number NULLS LAST, room.block_number NULLS LAST,
              room.room_in_block NULLS LAST, room.room_number`,
    [id],
  );
  const rooms = result.rows.map((room) => ({
    ...room,
    availablePlaces: Math.max(Number(room.capacity) - Number(room.occupied), 0),
  }));
  const floorMap = new Map();

  for (const room of rooms) {
    const floorKey = room.floorNumber === null ? 'other' : String(room.floorNumber);
    if (!floorMap.has(floorKey)) {
      floorMap.set(floorKey, {
        floorNumber: room.floorNumber,
        blockMap: new Map(),
        rooms: [],
      });
    }
    const floor = floorMap.get(floorKey);
    if (dorm.hasBlocks && room.blockNumber !== null) {
      const blockKey = String(room.blockNumber);
      if (!floor.blockMap.has(blockKey)) {
        floor.blockMap.set(blockKey, { blockNumber: room.blockNumber, rooms: [] });
      }
      floor.blockMap.get(blockKey).rooms.push(room);
    } else {
      floor.rooms.push(room);
    }
  }

  const floors = [...floorMap.values()].map((floor) => {
    const blocks = [...floor.blockMap.values()].map((block) => ({
      ...block,
      totals: summarizeRooms(block.rooms),
    }));
    const floorRooms = [...floor.rooms, ...blocks.flatMap((block) => block.rooms)];
    return {
      floorNumber: floor.floorNumber,
      totals: summarizeRooms(floorRooms),
      blocks,
      rooms: floor.rooms,
    };
  });

  response.json({
    dorm,
    totals: summarizeRooms(rooms),
    floors,
  });
}

export async function createDorm(request, response) {
  requireJsonObject(request.body);
  const dormNumber = readString(request.body, 'dormNumber', {
    required: true,
    maxLength: 20,
  });
  const address = readString(request.body, 'address', {
    required: true,
    maxLength: 255,
  });
  const totalFloors = readPositiveInteger(request.body, 'totalFloors');
  const residentialFloorFrom = readPositiveInteger(request.body, 'residentialFloorFrom');
  const hasBlocks = readBoolean(request.body, 'hasBlocks') ?? true;
  const blocksPerFloor = hasBlocks ? readPositiveInteger(request.body, 'blocksPerFloor') : null;
  const roomsPerBlock = hasBlocks ? readPositiveInteger(request.body, 'roomsPerBlock') : null;
  const roomsPerFloor = hasBlocks ? null : readPositiveInteger(request.body, 'roomsPerFloor');
  const defaultRoomCapacity = readPositiveInteger(request.body, 'defaultRoomCapacity');

  if (totalFloors && residentialFloorFrom && residentialFloorFrom > totalFloors) {
    throw new HttpError(400, 'residentialFloorFrom cannot exceed totalFloors.');
  }

  const result = await pool.query(
    `INSERT INTO dorm
      (dorm_number, address, total_floors, residential_floor_from, has_blocks,
       blocks_per_floor, rooms_per_block, rooms_per_floor, default_room_capacity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${COLUMNS}`,
    [
      dormNumber,
      address,
      totalFloors ?? null,
      residentialFloorFrom ?? null,
      hasBlocks,
      blocksPerFloor ?? null,
      roomsPerBlock ?? null,
      roomsPerFloor ?? null,
      defaultRoomCapacity ?? null,
    ],
  );

  response.status(201).json(result.rows[0]);
}

export async function updateDorm(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  await assertCanManageDorm(request.user, id);
  const current = rowOrNotFound(
    await pool.query(`SELECT ${COLUMNS} FROM dorm WHERE id = $1`, [id]),
    'Dorm',
  );
  const totalFloors = readPositiveInteger(request.body, 'totalFloors');
  const residentialFloorFrom = readPositiveInteger(request.body, 'residentialFloorFrom');
  const hasBlocks = readBoolean(request.body, 'hasBlocks');
  const nextTotalFloors = totalFloors ?? current.totalFloors;
  const nextResidentialFloorFrom = residentialFloorFrom ?? current.residentialFloorFrom;

  if (nextTotalFloors && nextResidentialFloorFrom && nextResidentialFloorFrom > nextTotalFloors) {
    throw new HttpError(400, 'residentialFloorFrom cannot exceed totalFloors.');
  }

  const query = updateStatement(
    'dorm',
    id,
    {
      dormNumber: readString(request.body, 'dormNumber', { maxLength: 20 }),
      address: readString(request.body, 'address', { maxLength: 255 }),
      totalFloors,
      residentialFloorFrom,
      hasBlocks,
      blocksPerFloor: hasBlocks === false ? null : readPositiveInteger(request.body, 'blocksPerFloor'),
      roomsPerBlock: hasBlocks === false ? null : readPositiveInteger(request.body, 'roomsPerBlock'),
      roomsPerFloor: hasBlocks === true ? null : readPositiveInteger(request.body, 'roomsPerFloor'),
      defaultRoomCapacity: readPositiveInteger(request.body, 'defaultRoomCapacity'),
    },
    {
      dormNumber: 'dorm_number',
      address: 'address',
      totalFloors: 'total_floors',
      residentialFloorFrom: 'residential_floor_from',
      hasBlocks: 'has_blocks',
      blocksPerFloor: 'blocks_per_floor',
      roomsPerBlock: 'rooms_per_block',
      roomsPerFloor: 'rooms_per_floor',
      defaultRoomCapacity: 'default_room_capacity',
    },
    COLUMNS,
  );
  const result = await pool.query(query);
  response.json(rowOrNotFound(result, 'Dorm'));
}

export async function deleteDorm(request, response) {
  const id = readId(request.params.id);
  await assertCanManageDorm(request.user, id);
  const result = await pool.query(`DELETE FROM dorm WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  rowOrNotFound(result, 'Dorm');
  response.status(204).send();
}

export async function generateRoomsFromLayout(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  await assertCanManageDorm(request.user, id);
  const totalFloors = readPositiveInteger(request.body, 'totalFloors', { required: true });
  const residentialFloorFrom = readPositiveInteger(request.body, 'residentialFloorFrom', {
    required: true,
  });
  const hasBlocks = readBoolean(request.body, 'hasBlocks') ?? true;
  const blocksPerFloor = hasBlocks
    ? readPositiveInteger(request.body, 'blocksPerFloor', { required: true })
    : null;
  const roomsPerBlock = hasBlocks
    ? readPositiveInteger(request.body, 'roomsPerBlock', { required: true })
    : null;
  const roomsPerFloor = hasBlocks
    ? null
    : readPositiveInteger(request.body, 'roomsPerFloor', { required: true });
  const defaultRoomCapacity = readPositiveInteger(request.body, 'defaultRoomCapacity', {
    required: true,
  });

  if (residentialFloorFrom > totalFloors) {
    throw new HttpError(400, 'residentialFloorFrom cannot exceed totalFloors.');
  }

  if (hasBlocks && roomsPerBlock > ROOM_SUFFIXES.length) {
    throw new HttpError(400, `A block can contain at most ${ROOM_SUFFIXES.length} lettered rooms.`);
  }

  const generatedRoomsPerFloor = hasBlocks ? blocksPerFloor * roomsPerBlock : roomsPerFloor;
  if (generatedRoomsPerFloor > 99) {
    throw new HttpError(400, 'A generated floor can contain at most 99 rooms.');
  }

  const roomValues = [];
  for (let floor = residentialFloorFrom; floor <= totalFloors; floor += 1) {
    if (hasBlocks) {
      for (let block = 1; block <= blocksPerFloor; block += 1) {
        for (let roomInBlock = 1; roomInBlock <= roomsPerBlock; roomInBlock += 1) {
          roomValues.push([
            id,
            `${floor}${String(block).padStart(2, '0')}${ROOM_SUFFIXES[roomInBlock - 1]}`,
            defaultRoomCapacity,
            floor,
            block,
            roomInBlock,
          ]);
        }
      }
    } else {
      for (let room = 1; room <= roomsPerFloor; room += 1) {
        roomValues.push([
          id,
          `${floor}${String(room).padStart(2, '0')}`,
          defaultRoomCapacity,
          floor,
          null,
          null,
        ]);
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    rowOrNotFound(await client.query(`SELECT ${COLUMNS} FROM dorm WHERE id = $1 FOR UPDATE`, [id]), 'Dorm');
    await client.query(
      `UPDATE dorm
       SET total_floors = $2, residential_floor_from = $3, has_blocks = $4,
           blocks_per_floor = $5, rooms_per_block = $6, rooms_per_floor = $7,
           default_room_capacity = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        id,
        totalFloors,
        residentialFloorFrom,
        hasBlocks,
        blocksPerFloor,
        roomsPerBlock,
        roomsPerFloor,
        defaultRoomCapacity,
      ],
    );
    let createdRooms = 0;
    for (const values of roomValues) {
      const result = await client.query(
        `INSERT INTO room
          (dorm_id, room_number, capacity, floor_number, block_number, room_in_block)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        values,
      );
      createdRooms += result.rowCount;
    }
    await client.query('COMMIT');
    response.status(201).json({
      dormId: id,
      createdRooms,
      totalRooms: roomValues.length,
      totalPlaces: roomValues.length * defaultRoomCapacity,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
