-- Rename in place (keeps rows); the check compares as text because a value added
-- by ADD VALUE cannot be used as an enum literal in the same transaction.
ALTER TABLE "billing_run_items" DROP CONSTRAINT "billing_run_items_invoice_chk";--> statement-breakpoint
ALTER TYPE "public"."billing_run_item_outcome" RENAME VALUE 'invoiced' TO 'created';--> statement-breakpoint
ALTER TYPE "public"."billing_run_item_outcome" ADD VALUE 'already_billed' AFTER 'created';--> statement-breakpoint
ALTER TABLE "billing_run_items" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "billing_runs" ADD COLUMN "already_billed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_invoice_chk" CHECK ("billing_run_items"."outcome"::text not in ('created', 'already_billed') or "billing_run_items"."invoice_id" is not null);
