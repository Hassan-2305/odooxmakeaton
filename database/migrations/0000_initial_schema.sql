CREATE TYPE "public"."billing_run_item_outcome" AS ENUM('invoiced', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."billing_run_mode" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TYPE "public"."billing_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."credit_note_status" AS ENUM('draft', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('INR');--> statement-breakpoint
CREATE TYPE "public"."discount_scope" AS ENUM('order', 'product');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'confirmed', 'dismissed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."invoice_line_kind" AS ENUM('product', 'discount');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'confirmed', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank_transfer', 'upi', 'card', 'cheque');--> statement-breakpoint
CREATE TYPE "public"."plan_interval" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('draft', 'quotation', 'active', 'paused', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'staff', 'customer');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"gstin" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "password_resets_expiry_chk" CHECK ("password_resets"."expires_at" > "password_resets"."created_at")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"business_name" text DEFAULT 'Brightloop One' NOT NULL,
	"business_timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"currency" "currency" DEFAULT 'INR' NOT NULL,
	"invoice_prefix" text DEFAULT 'INV-' NOT NULL,
	"next_invoice_seq" bigint DEFAULT 1 NOT NULL,
	"subscription_prefix" text DEFAULT 'SUB-' NOT NULL,
	"next_subscription_seq" bigint DEFAULT 1 NOT NULL,
	"credit_note_prefix" text DEFAULT 'CN-' NOT NULL,
	"next_credit_note_seq" bigint DEFAULT 1 NOT NULL,
	"default_payment_terms_days" integer DEFAULT 15 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton_chk" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_seq_chk" CHECK ("settings"."next_invoice_seq" >= 1 and "settings"."next_subscription_seq" >= 1 and "settings"."next_credit_note_seq" >= 1),
	CONSTRAINT "settings_payment_terms_chk" CHECK ("settings"."default_payment_terms_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"customer_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_customer_role_chk" CHECK (("users"."role" = 'customer') = ("users"."customer_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "attribute_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attribute_id" uuid NOT NULL,
	"value" text NOT NULL,
	"price_extra_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attribute_values_attribute_value_unique" UNIQUE("attribute_id","value"),
	CONSTRAINT "attribute_values_price_extra_chk" CHECK ("attribute_values"."price_extra_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discount_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"type" "discount_type" NOT NULL,
	"value" bigint NOT NULL,
	"min_amount_paise" bigint DEFAULT 0 NOT NULL,
	"min_qty" integer DEFAULT 1 NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"scope" "discount_scope" DEFAULT 'order' NOT NULL,
	"product_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_rules_code_unique" UNIQUE("code"),
	CONSTRAINT "discount_rules_value_chk" CHECK ("discount_rules"."value" > 0),
	CONSTRAINT "discount_rules_percentage_chk" CHECK ("discount_rules"."type" <> 'percentage' or "discount_rules"."value" <= 10000),
	CONSTRAINT "discount_rules_min_amount_chk" CHECK ("discount_rules"."min_amount_paise" >= 0),
	CONSTRAINT "discount_rules_min_qty_chk" CHECK ("discount_rules"."min_qty" >= 1),
	CONSTRAINT "discount_rules_validity_chk" CHECK ("discount_rules"."valid_from" is null or "discount_rules"."valid_to" is null or "discount_rules"."valid_to" >= "discount_rules"."valid_from"),
	CONSTRAINT "discount_rules_usage_limit_chk" CHECK ("discount_rules"."usage_limit" is null or "discount_rules"."usage_limit" >= 1),
	CONSTRAINT "discount_rules_used_count_chk" CHECK ("discount_rules"."used_count" >= 0 and ("discount_rules"."usage_limit" is null or "discount_rules"."used_count" <= "discount_rules"."usage_limit")),
	CONSTRAINT "discount_rules_scope_chk" CHECK (("discount_rules"."scope" = 'product') = ("discount_rules"."product_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "product_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_attributes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sku" text,
	"currency" "currency" DEFAULT 'INR' NOT NULL,
	"base_price_paise" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_base_price_chk" CHECK ("products"."base_price_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recurring_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"interval" "plan_interval" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"min_quantity" integer DEFAULT 1 NOT NULL,
	"available_from" date,
	"available_to" date,
	"auto_close_on_end" boolean DEFAULT false NOT NULL,
	"closable_early" boolean DEFAULT true NOT NULL,
	"pausable" boolean DEFAULT false NOT NULL,
	"renewable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_plans_interval_count_chk" CHECK ("recurring_plans"."interval_count" >= 1),
	CONSTRAINT "recurring_plans_min_quantity_chk" CHECK ("recurring_plans"."min_quantity" >= 1),
	CONSTRAINT "recurring_plans_availability_chk" CHECK ("recurring_plans"."available_from" is null or "recurring_plans"."available_to" is null or "recurring_plans"."available_to" > "recurring_plans"."available_from")
);
--> statement-breakpoint
CREATE TABLE "taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"inclusive" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxes_rate_chk" CHECK ("taxes"."rate_bps" between 0 and 10000),
	CONSTRAINT "taxes_effective_range_chk" CHECK ("taxes"."effective_to" is null or "taxes"."effective_to" > "taxes"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "variant_attribute_values" (
	"variant_id" uuid NOT NULL,
	"attribute_value_id" uuid NOT NULL,
	CONSTRAINT "variant_attribute_values_variant_id_attribute_value_id_pk" PRIMARY KEY("variant_id","attribute_value_id")
);
--> statement-breakpoint
CREATE TABLE "quotation_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"validity_days" integer DEFAULT 30 NOT NULL,
	"recurring_plan_id" uuid,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_templates_validity_chk" CHECK ("quotation_templates"."validity_days" >= 1)
);
--> statement-breakpoint
CREATE TABLE "template_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "template_lines_quantity_chk" CHECK ("template_lines"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_status" "subscription_status",
	"to_status" "subscription_status",
	"actor_user_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_line_taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_line_id" uuid NOT NULL,
	"tax_id" uuid,
	"name" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"inclusive" boolean NOT NULL,
	CONSTRAINT "subscription_line_taxes_line_tax_unique" UNIQUE("subscription_line_id","tax_id"),
	CONSTRAINT "subscription_line_taxes_rate_chk" CHECK ("subscription_line_taxes"."rate_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "subscription_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_lines_quantity_chk" CHECK ("subscription_lines"."quantity" >= 1),
	CONSTRAINT "subscription_lines_unit_price_chk" CHECK ("subscription_lines"."unit_price_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"recurring_plan_id" uuid NOT NULL,
	"quotation_template_id" uuid,
	"status" "subscription_status" DEFAULT 'draft' NOT NULL,
	"currency" "currency" DEFAULT 'INR' NOT NULL,
	"start_date" date NOT NULL,
	"expiry_date" date,
	"next_invoice_date" date,
	"anchor_day" smallint NOT NULL,
	"payment_terms_days" integer DEFAULT 0 NOT NULL,
	"quotation_expires_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_number_unique" UNIQUE("number"),
	CONSTRAINT "subscriptions_anchor_day_chk" CHECK ("subscriptions"."anchor_day" between 1 and 31),
	CONSTRAINT "subscriptions_payment_terms_chk" CHECK ("subscriptions"."payment_terms_days" >= 0),
	CONSTRAINT "subscriptions_expiry_chk" CHECK ("subscriptions"."expiry_date" is null or "subscriptions"."expiry_date" > "subscriptions"."start_date"),
	CONSTRAINT "subscriptions_next_invoice_chk" CHECK ("subscriptions"."next_invoice_date" is null or "subscriptions"."next_invoice_date" >= "subscriptions"."start_date")
);
--> statement-breakpoint
CREATE TABLE "billing_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_run_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"outcome" "billing_run_item_outcome" NOT NULL,
	"reason" text,
	"invoice_id" uuid,
	"retry_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_run_items_invoice_chk" CHECK ("billing_run_items"."outcome" <> 'invoiced' or "billing_run_items"."invoice_id" is not null),
	CONSTRAINT "billing_run_items_retry_chk" CHECK ("billing_run_items"."retry_of" is null or "billing_run_items"."retry_of" <> "billing_run_items"."id")
);
--> statement-breakpoint
CREATE TABLE "billing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "billing_run_mode" NOT NULL,
	"status" "billing_run_status" DEFAULT 'running' NOT NULL,
	"business_date" date NOT NULL,
	"triggered_by" uuid,
	"considered_count" integer DEFAULT 0 NOT NULL,
	"invoiced_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "billing_runs_counts_chk" CHECK ("billing_runs"."considered_count" >= 0 and "billing_runs"."invoiced_count" >= 0 and "billing_runs"."skipped_count" >= 0 and "billing_runs"."failed_count" >= 0),
	CONSTRAINT "billing_runs_finished_chk" CHECK ("billing_runs"."finished_at" is null or "billing_runs"."finished_at" >= "billing_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"invoice_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "credit_note_status" DEFAULT 'draft' NOT NULL,
	"currency" "currency" DEFAULT 'INR' NOT NULL,
	"reason" text NOT NULL,
	"subtotal_paise" bigint NOT NULL,
	"tax_total_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint NOT NULL,
	"issue_date" date,
	"confirmed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_number_unique" UNIQUE("number"),
	CONSTRAINT "credit_notes_amounts_chk" CHECK ("credit_notes"."subtotal_paise" >= 0 and "credit_notes"."tax_total_paise" >= 0 and "credit_notes"."total_paise" > 0),
	CONSTRAINT "credit_notes_total_chk" CHECK ("credit_notes"."total_paise" = "credit_notes"."subtotal_paise" + "credit_notes"."tax_total_paise"),
	CONSTRAINT "credit_notes_number_chk" CHECK ("credit_notes"."status" = 'draft' or "credit_notes"."number" is not null)
);
--> statement-breakpoint
CREATE TABLE "discount_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discount_rule_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_line_id" uuid,
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_applications_rule_invoice_unique" UNIQUE("discount_rule_id","invoice_id"),
	CONSTRAINT "discount_applications_amount_chk" CHECK ("discount_applications"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_line_taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_line_id" uuid NOT NULL,
	"tax_id" uuid,
	"name" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"inclusive" boolean NOT NULL,
	"taxable_amount_paise" bigint NOT NULL,
	"tax_amount_paise" bigint NOT NULL,
	CONSTRAINT "invoice_line_taxes_rate_chk" CHECK ("invoice_line_taxes"."rate_bps" between 0 and 10000),
	CONSTRAINT "invoice_line_taxes_amounts_chk" CHECK ("invoice_line_taxes"."taxable_amount_paise" >= 0 and "invoice_line_taxes"."tax_amount_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" "invoice_line_kind" NOT NULL,
	"subscription_line_id" uuid,
	"product_id" uuid,
	"variant_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_paise" bigint NOT NULL,
	"amount_paise" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_lines_quantity_chk" CHECK ("invoice_lines"."quantity" >= 1),
	CONSTRAINT "invoice_lines_amounts_chk" CHECK ("invoice_lines"."unit_price_paise" >= 0 and "invoice_lines"."amount_paise" >= 0),
	CONSTRAINT "invoice_lines_product_chk" CHECK ("invoice_lines"."kind" <> 'product' or "invoice_lines"."product_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"subscription_id" uuid,
	"customer_id" uuid NOT NULL,
	"billing_run_id" uuid,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"currency" "currency" DEFAULT 'INR' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"issue_date" date,
	"due_date" date,
	"customer_snapshot" jsonb NOT NULL,
	"subtotal_paise" bigint DEFAULT 0 NOT NULL,
	"discount_total_paise" bigint DEFAULT 0 NOT NULL,
	"tax_total_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"amount_paid_paise" bigint DEFAULT 0 NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_subscription_period_unique" UNIQUE("subscription_id","period_start"),
	CONSTRAINT "invoices_period_chk" CHECK ("invoices"."period_end" > "invoices"."period_start"),
	CONSTRAINT "invoices_due_date_chk" CHECK ("invoices"."due_date" is null or "invoices"."issue_date" is null or "invoices"."due_date" >= "invoices"."issue_date"),
	CONSTRAINT "invoices_amounts_chk" CHECK ("invoices"."subtotal_paise" >= 0 and "invoices"."discount_total_paise" >= 0 and "invoices"."tax_total_paise" >= 0 and "invoices"."total_paise" >= 0),
	CONSTRAINT "invoices_total_chk" CHECK ("invoices"."total_paise" = "invoices"."subtotal_paise" - "invoices"."discount_total_paise" + "invoices"."tax_total_paise"),
	CONSTRAINT "invoices_amount_paid_chk" CHECK ("invoices"."amount_paid_paise" >= 0 and "invoices"."amount_paid_paise" <= "invoices"."total_paise"),
	CONSTRAINT "invoices_number_chk" CHECK ("invoices"."status" = 'draft' or "invoices"."number" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_payment_invoice_unique" UNIQUE("payment_id","invoice_id"),
	CONSTRAINT "payment_allocations_amount_chk" CHECK ("payment_allocations"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"currency" "currency" DEFAULT 'INR' NOT NULL,
	"amount_paise" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_chk" CHECK ("payments"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrity_finding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"from_status" "finding_status",
	"to_status" "finding_status" NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrity_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule" text NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"customer_id" uuid,
	"expected" jsonb,
	"actual" jsonb,
	"impact_paise" bigint DEFAULT 0 NOT NULL,
	"confirmed_impact_paise" bigint,
	"evidence" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrity_findings_impact_chk" CHECK ("integrity_findings"."impact_paise" >= 0),
	CONSTRAINT "integrity_findings_confirmed_impact_chk" CHECK ("integrity_findings"."confirmed_impact_paise" is null or "integrity_findings"."confirmed_impact_paise" >= 0),
	CONSTRAINT "integrity_findings_resolved_chk" CHECK ("integrity_findings"."resolved_at" is null or "integrity_findings"."resolved_at" >= "integrity_findings"."detected_at")
);
--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_attribute_id_product_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_attribute_value_id_attribute_values_id_fk" FOREIGN KEY ("attribute_value_id") REFERENCES "public"."attribute_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_templates" ADD CONSTRAINT "quotation_templates_recurring_plan_id_recurring_plans_id_fk" FOREIGN KEY ("recurring_plan_id") REFERENCES "public"."recurring_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_lines" ADD CONSTRAINT "template_lines_template_id_quotation_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quotation_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_lines" ADD CONSTRAINT "template_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_lines" ADD CONSTRAINT "template_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_line_taxes" ADD CONSTRAINT "subscription_line_taxes_subscription_line_id_subscription_lines_id_fk" FOREIGN KEY ("subscription_line_id") REFERENCES "public"."subscription_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_line_taxes" ADD CONSTRAINT "subscription_line_taxes_tax_id_taxes_id_fk" FOREIGN KEY ("tax_id") REFERENCES "public"."taxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_recurring_plan_id_recurring_plans_id_fk" FOREIGN KEY ("recurring_plan_id") REFERENCES "public"."recurring_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_quotation_template_id_quotation_templates_id_fk" FOREIGN KEY ("quotation_template_id") REFERENCES "public"."quotation_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_billing_run_id_billing_runs_id_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."billing_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_retry_of_billing_run_items_id_fk" FOREIGN KEY ("retry_of") REFERENCES "public"."billing_run_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_discount_rule_id_discount_rules_id_fk" FOREIGN KEY ("discount_rule_id") REFERENCES "public"."discount_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_taxes" ADD CONSTRAINT "invoice_line_taxes_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_taxes" ADD CONSTRAINT "invoice_line_taxes_tax_id_taxes_id_fk" FOREIGN KEY ("tax_id") REFERENCES "public"."taxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_subscription_line_id_subscription_lines_id_fk" FOREIGN KEY ("subscription_line_id") REFERENCES "public"."subscription_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_run_id_billing_runs_id_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."billing_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_finding_events" ADD CONSTRAINT "integrity_finding_events_finding_id_integrity_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."integrity_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_finding_events" ADD CONSTRAINT "integrity_finding_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_findings" ADD CONSTRAINT "integrity_findings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "password_resets_user_id_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_customer_id_idx" ON "users" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "discount_rules_product_id_idx" ON "discount_rules" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "template_lines_template_id_idx" ON "template_lines" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "subscription_events_subscription_id_idx" ON "subscription_events" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_lines_subscription_id_idx" ON "subscription_lines" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_next_invoice_date_idx" ON "subscriptions" USING btree ("status","next_invoice_date");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_id_idx" ON "subscriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "billing_run_items_billing_run_id_idx" ON "billing_run_items" USING btree ("billing_run_id");--> statement-breakpoint
CREATE INDEX "billing_run_items_subscription_id_idx" ON "billing_run_items" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "billing_runs_business_date_idx" ON "billing_runs" USING btree ("business_date");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "credit_notes_customer_id_idx" ON "credit_notes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "discount_applications_invoice_id_idx" ON "discount_applications" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_line_taxes_invoice_line_id_idx" ON "invoice_line_taxes" USING btree ("invoice_line_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_due_date_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_customer_id_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "integrity_finding_events_finding_id_idx" ON "integrity_finding_events" USING btree ("finding_id","created_at");--> statement-breakpoint
CREATE INDEX "integrity_findings_status_rule_idx" ON "integrity_findings" USING btree ("status","rule");--> statement-breakpoint
CREATE INDEX "integrity_findings_entity_idx" ON "integrity_findings" USING btree ("entity_type","entity_id");