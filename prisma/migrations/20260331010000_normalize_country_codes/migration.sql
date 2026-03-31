-- Normalize country names → ISO 3166-1 alpha-2 codes across all tables.
-- This handles legacy data stored as full country names (e.g. "United Kingdom" → "GB").

-- ─── Helper: create a temp lookup table ─────────────────────

CREATE TEMP TABLE _country_map (name TEXT PRIMARY KEY, code TEXT NOT NULL);
INSERT INTO _country_map (name, code) VALUES
  ('UNITED KINGDOM', 'GB'), ('UK', 'GB'), ('GREAT BRITAIN', 'GB'), ('ENGLAND', 'GB'),
  ('UNITED STATES', 'US'), ('USA', 'US'), ('UNITED STATES OF AMERICA', 'US'),
  ('EGYPT', 'EG'), ('NIGERIA', 'NG'), ('SOUTH AFRICA', 'ZA'), ('KENYA', 'KE'), ('GHANA', 'GH'),
  ('CANADA', 'CA'), ('AUSTRALIA', 'AU'), ('NEW ZEALAND', 'NZ'),
  ('FRANCE', 'FR'), ('GERMANY', 'DE'), ('SPAIN', 'ES'), ('ITALY', 'IT'),
  ('NETHERLANDS', 'NL'), ('BELGIUM', 'BE'), ('PORTUGAL', 'PT'), ('POLAND', 'PL'),
  ('SWEDEN', 'SE'), ('NORWAY', 'NO'), ('DENMARK', 'DK'), ('FINLAND', 'FI'),
  ('IRELAND', 'IE'), ('SWITZERLAND', 'CH'), ('AUSTRIA', 'AT'), ('GREECE', 'GR'),
  ('TURKEY', 'TR'), ('INDIA', 'IN'), ('CHINA', 'CN'), ('JAPAN', 'JP'),
  ('SOUTH KOREA', 'KR'), ('SINGAPORE', 'SG'), ('MALAYSIA', 'MY'), ('THAILAND', 'TH'),
  ('INDONESIA', 'ID'), ('PHILIPPINES', 'PH'), ('VIETNAM', 'VN'),
  ('BRAZIL', 'BR'), ('ARGENTINA', 'AR'), ('MEXICO', 'MX'), ('CHILE', 'CL'),
  ('COLOMBIA', 'CO'), ('PERU', 'PE'), ('ISRAEL', 'IL'),
  ('UAE', 'AE'), ('UNITED ARAB EMIRATES', 'AE'), ('SAUDI ARABIA', 'SA'),
  ('QATAR', 'QA'), ('KUWAIT', 'KW'), ('BAHRAIN', 'BH'), ('OMAN', 'OM'),
  ('PAKISTAN', 'PK'), ('BANGLADESH', 'BD'), ('SRI LANKA', 'LK'),
  ('MOROCCO', 'MA'), ('TUNISIA', 'TN'), ('ALGERIA', 'DZ'),
  ('CAMEROON', 'CM'), ('SENEGAL', 'SN'), ('IVORY COAST', 'CI'),
  ('TANZANIA', 'TZ'), ('UGANDA', 'UG'), ('ETHIOPIA', 'ET'), ('RWANDA', 'RW');

-- ─── Company.country ────────────────────────────────────────

UPDATE "Company" c
SET "country" = m.code
FROM _country_map m
WHERE UPPER(TRIM(c."country")) = m.name
  AND LENGTH(TRIM(c."country")) > 2;

-- ─── User.country ───────────────────────────────────────────

UPDATE "User" u
SET "country" = m.code
FROM _country_map m
WHERE u."country" IS NOT NULL
  AND UPPER(TRIM(u."country")) = m.name
  AND LENGTH(TRIM(u."country")) > 2;

-- ─── WarehouseAddress.country + sync countryCode ────────────

UPDATE "WarehouseAddress" wa
SET "country" = m.code
FROM _country_map m
WHERE UPPER(TRIM(wa."country")) = m.name
  AND LENGTH(TRIM(wa."country")) > 2;

UPDATE "WarehouseAddress"
SET "countryCode" = "country"
WHERE "countryCode" IS NULL OR "countryCode" <> "country";

UPDATE "WarehouseAddress"
SET "addressLine1" = "address"
WHERE "addressLine1" IS NULL AND "address" IS NOT NULL;

UPDATE "WarehouseAddress"
SET "stateOrProvince" = "state"
WHERE "stateOrProvince" IS NULL AND "state" IS NOT NULL;

-- ─── ShipmentSlot.originCountry / destinationCountry ────────

UPDATE "ShipmentSlot" s
SET "originCountry" = m.code
FROM _country_map m
WHERE UPPER(TRIM(s."originCountry")) = m.name
  AND LENGTH(TRIM(s."originCountry")) > 2;

UPDATE "ShipmentSlot" s
SET "destinationCountry" = m.code
FROM _country_map m
WHERE UPPER(TRIM(s."destinationCountry")) = m.name
  AND LENGTH(TRIM(s."destinationCountry")) > 2;

-- ─── ShipmentRequest.originCountry / destinationCountry ─────

UPDATE "ShipmentRequest" sr
SET "originCountry" = m.code
FROM _country_map m
WHERE UPPER(TRIM(sr."originCountry")) = m.name
  AND LENGTH(TRIM(sr."originCountry")) > 2;

UPDATE "ShipmentRequest" sr
SET "destinationCountry" = m.code
FROM _country_map m
WHERE UPPER(TRIM(sr."destinationCountry")) = m.name
  AND LENGTH(TRIM(sr."destinationCountry")) > 2;

-- ─── Booking pickup/delivery countries ──────────────────────

UPDATE "Booking" b
SET "pickupCountry" = m.code
FROM _country_map m
WHERE b."pickupCountry" IS NOT NULL
  AND UPPER(TRIM(b."pickupCountry")) = m.name
  AND LENGTH(TRIM(b."pickupCountry")) > 2;

UPDATE "Booking" b
SET "deliveryCountry" = m.code
FROM _country_map m
WHERE b."deliveryCountry" IS NOT NULL
  AND UPPER(TRIM(b."deliveryCountry")) = m.name
  AND LENGTH(TRIM(b."deliveryCountry")) > 2;

-- ─── TravelCourierListing.originCountry / destinationCountry

UPDATE "TravelCourierListing" t
SET "originCountry" = m.code
FROM _country_map m
WHERE UPPER(TRIM(t."originCountry")) = m.name
  AND LENGTH(TRIM(t."originCountry")) > 2;

UPDATE "TravelCourierListing" t
SET "destinationCountry" = m.code
FROM _country_map m
WHERE UPPER(TRIM(t."destinationCountry")) = m.name
  AND LENGTH(TRIM(t."destinationCountry")) > 2;

-- ─── Cleanup ────────────────────────────────────────────────

DROP TABLE _country_map;
