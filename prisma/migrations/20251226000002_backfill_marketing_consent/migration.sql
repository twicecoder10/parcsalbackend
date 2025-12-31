-- Backfill MarketingConsent records for all existing users
-- This ensures all users created before the Marketing feature have consent records
-- with the new opt-out defaults (all true)

INSERT INTO "MarketingConsent" ("id", "userId", "emailMarketingOptIn", "whatsappMarketingOptIn", "carrierMarketingOptIn", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid()::text as id,
  u.id as "userId",
  true as "emailMarketingOptIn",
  true as "whatsappMarketingOptIn",
  true as "carrierMarketingOptIn",
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 
  FROM "MarketingConsent" mc 
  WHERE mc."userId" = u.id
)
ON CONFLICT ("userId") DO NOTHING;

