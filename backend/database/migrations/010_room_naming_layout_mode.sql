BEGIN;

ALTER TABLE dorm
  ADD COLUMN IF NOT EXISTS has_blocks BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rooms_per_floor INTEGER CHECK (rooms_per_floor > 0);

UPDATE dorm
SET has_blocks = FALSE
WHERE blocks_per_floor IS NULL AND rooms_per_block IS NULL;

UPDATE room AS current_room
SET room_number =
  current_room.floor_number::text
  || LPAD(current_room.block_number::text, 2, '0')
  || COALESCE(
       (ARRAY[
         'а', 'б', 'в', 'г', 'ґ', 'д', 'е', 'є', 'ж', 'з', 'и',
         'і', 'ї', 'й', 'к', 'л', 'м', 'н', 'о', 'п', 'р', 'с',
         'т', 'у', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ю', 'я'
       ]::text[])[current_room.room_in_block],
       '-' || current_room.room_in_block::text
     ),
    updated_at = CURRENT_TIMESTAMP
FROM dorm
WHERE dorm.id = current_room.dorm_id
  AND dorm.has_blocks = TRUE
  AND current_room.floor_number IS NOT NULL
  AND current_room.block_number IS NOT NULL
  AND current_room.room_in_block IS NOT NULL;

COMMIT;
