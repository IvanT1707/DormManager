BEGIN;

ALTER TABLE dorm
  ADD COLUMN IF NOT EXISTS total_floors INTEGER CHECK (total_floors > 0),
  ADD COLUMN IF NOT EXISTS residential_floor_from INTEGER CHECK (residential_floor_from > 0),
  ADD COLUMN IF NOT EXISTS blocks_per_floor INTEGER CHECK (blocks_per_floor > 0),
  ADD COLUMN IF NOT EXISTS rooms_per_block INTEGER CHECK (rooms_per_block > 0),
  ADD COLUMN IF NOT EXISTS default_room_capacity INTEGER CHECK (default_room_capacity > 0);

ALTER TABLE dorm
  DROP CONSTRAINT IF EXISTS dorm_residential_floor_valid;

ALTER TABLE dorm
  ADD CONSTRAINT dorm_residential_floor_valid CHECK (
    total_floors IS NULL OR residential_floor_from IS NULL OR residential_floor_from <= total_floors
  );

ALTER TABLE room
  ADD COLUMN IF NOT EXISTS floor_number INTEGER CHECK (floor_number > 0),
  ADD COLUMN IF NOT EXISTS block_number INTEGER CHECK (block_number > 0),
  ADD COLUMN IF NOT EXISTS room_in_block INTEGER CHECK (room_in_block > 0);

CREATE UNIQUE INDEX IF NOT EXISTS room_dorm_layout_unique
  ON room(dorm_id, floor_number, block_number, room_in_block)
  WHERE floor_number IS NOT NULL AND block_number IS NOT NULL AND room_in_block IS NOT NULL;

COMMIT;
