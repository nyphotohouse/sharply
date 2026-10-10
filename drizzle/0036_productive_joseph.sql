ALTER TABLE "app"."gear_price_estimates" ADD COLUMN "calculation_inputs" jsonb;--> statement-breakpoint
ALTER TABLE "app"."gear_price_fetch_runs" ADD COLUMN "run_kind" varchar(40) DEFAULT 'MAPPING_REFRESH' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."gear_price_fetch_runs" ADD COLUMN "source_key" varchar(40);--> statement-breakpoint
ALTER TABLE "app"."gear_price_fetch_runs" ADD COLUMN "summary" jsonb;