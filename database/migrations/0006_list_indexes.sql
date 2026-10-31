CREATE INDEX "subscriptions_created_at_idx" ON "subscriptions" USING btree ("created_at" DESC NULLS FIRST,"id");--> statement-breakpoint
CREATE INDEX "subscriptions_expiry_date_idx" ON "subscriptions" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "billing_runs_started_at_idx" ON "billing_runs" USING btree ("started_at" DESC NULLS FIRST,"id");--> statement-breakpoint
CREATE INDEX "invoices_created_at_idx" ON "invoices" USING btree ("created_at" DESC NULLS FIRST,"id");--> statement-breakpoint
CREATE INDEX "invoices_issue_date_idx" ON "invoices" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "payments_paid_on_idx" ON "payments" USING btree ("paid_on" DESC NULLS FIRST,"id");