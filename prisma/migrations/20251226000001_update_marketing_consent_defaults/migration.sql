-- Update existing MarketingConsent records to opt-in by default
-- This changes the default behavior from opt-in (false) to opt-out (true)
-- All existing users will be opted-in to marketing by default
UPDATE "MarketingConsent"
SET 
  "emailMarketingOptIn" = true,
  "whatsappMarketingOptIn" = true,
  "carrierMarketingOptIn" = true
WHERE 
  "emailMarketingOptIn" = false 
  OR "whatsappMarketingOptIn" = false 
  OR "carrierMarketingOptIn" = false;

-- Alter the table to change default values for new records
ALTER TABLE "MarketingConsent" 
  ALTER COLUMN "emailMarketingOptIn" SET DEFAULT true,
  ALTER COLUMN "whatsappMarketingOptIn" SET DEFAULT true,
  ALTER COLUMN "carrierMarketingOptIn" SET DEFAULT true;

