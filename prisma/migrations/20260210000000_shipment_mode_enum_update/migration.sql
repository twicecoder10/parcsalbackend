-- ShipmentMode enum update: migrate to AIR_CARGO, SEA_CARGO, AIR_FREIGHT only.
-- Map existing data: AIR -> AIR_FREIGHT, SHIP -> SEA_CARGO, BUS/VAN/TRAIN/RIDER -> SEA_CARGO.

-- Create new enum with only the 3 allowed values
CREATE TYPE "ShipmentMode_new" AS ENUM ('AIR_CARGO', 'SEA_CARGO', 'AIR_FREIGHT');

-- Add temporary column with new enum type
ALTER TABLE "ShipmentSlot" ADD COLUMN "mode_new" "ShipmentMode_new";

-- Backfill: map old values to new (prevents breaking existing shipments)
UPDATE "ShipmentSlot"
SET "mode_new" = CASE "mode"::text
  WHEN 'AIR' THEN 'AIR_FREIGHT'::"ShipmentMode_new"
  WHEN 'SHIP' THEN 'SEA_CARGO'::"ShipmentMode_new"
  WHEN 'BUS' THEN 'SEA_CARGO'::"ShipmentMode_new"
  WHEN 'VAN' THEN 'SEA_CARGO'::"ShipmentMode_new"
  WHEN 'TRAIN' THEN 'SEA_CARGO'::"ShipmentMode_new"
  WHEN 'RIDER' THEN 'SEA_CARGO'::"ShipmentMode_new"
  ELSE 'SEA_CARGO'::"ShipmentMode_new"
END;

-- Make non-nullable (all rows updated above)
ALTER TABLE "ShipmentSlot" ALTER COLUMN "mode_new" SET NOT NULL;

-- Drop old column and type
ALTER TABLE "ShipmentSlot" DROP COLUMN "mode";
DROP TYPE "ShipmentMode";

-- Rename new type and column to original names
ALTER TYPE "ShipmentMode_new" RENAME TO "ShipmentMode";
ALTER TABLE "ShipmentSlot" RENAME COLUMN "mode_new" TO "mode";

-- Add composite index for filtering by mode and departureTime
CREATE INDEX "ShipmentSlot_mode_departureTime_idx" ON "ShipmentSlot"("mode", "departureTime");
