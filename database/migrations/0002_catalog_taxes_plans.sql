CREATE TABLE "product_taxes" (
	"product_id" uuid NOT NULL,
	"tax_id" uuid NOT NULL,
	CONSTRAINT "product_taxes_product_id_tax_id_pk" PRIMARY KEY("product_id","tax_id")
);
--> statement-breakpoint
ALTER TABLE "product_attributes" DROP CONSTRAINT "product_attributes_name_unique";--> statement-breakpoint
ALTER TABLE "product_attributes" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD COLUMN "price_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "taxes" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "product_taxes" ADD CONSTRAINT "product_taxes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_taxes" ADD CONSTRAINT "product_taxes_tax_id_taxes_id_fk" FOREIGN KEY ("tax_id") REFERENCES "public"."taxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_name_unique" UNIQUE NULLS NOT DISTINCT("product_id","name");--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_price_chk" CHECK ("recurring_plans"."price_paise" >= 0);