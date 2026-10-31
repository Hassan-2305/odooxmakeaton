-- Rename in place so existing rows and the check constraints that compare against
-- these values keep working (drop/recreate of the types would break them).
ALTER TYPE "public"."discount_type" RENAME VALUE 'percentage' TO 'percent';--> statement-breakpoint
ALTER TYPE "public"."discount_scope" RENAME VALUE 'order' TO 'subscription';--> statement-breakpoint
ALTER TABLE "discount_rules" ALTER COLUMN "scope" SET DEFAULT 'subscription';
