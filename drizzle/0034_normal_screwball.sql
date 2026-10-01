CREATE TYPE "public"."gear_price_fetch_run_item_status" AS ENUM('SUCCESS', 'NO_DATA', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."gear_price_fetch_run_status" AS ENUM('RUNNING', 'SUCCESS', 'PARTIAL', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."gear_price_fetch_run_trigger" AS ENUM('CRON');--> statement-breakpoint
CREATE TYPE "public"."gear_price_fetch_status" AS ENUM('NEVER', 'SUCCESS', 'NO_DATA', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."gear_price_mapping_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."gear_price_observation_status" AS ENUM('VALID', 'INVALID');--> statement-breakpoint
CREATE TYPE "public"."gear_price_observation_value_kind" AS ENUM('POINT', 'RANGE');--> statement-breakpoint
CREATE TABLE "app"."gear_price_estimates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"gear_id" varchar(36) NOT NULL,
	"market_key" varchar(40) NOT NULL,
	"price_kind" varchar(40) DEFAULT 'used_retail' NOT NULL,
	"low_minor" integer NOT NULL,
	"typical_minor" integer NOT NULL,
	"high_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"method_version" integer DEFAULT 1 NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"observation_count" integer DEFAULT 0 NOT NULL,
	"input_observation_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."gear_price_fetch_run_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"mapping_id" varchar(36),
	"gear_id" varchar(36),
	"gear_name" text NOT NULL,
	"gear_slug" text NOT NULL,
	"source_key" varchar(40) NOT NULL,
	"market_key" varchar(40) NOT NULL,
	"status" "gear_price_fetch_run_item_status" NOT NULL,
	"inserted_observation_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"next_fetch_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "app"."gear_price_fetch_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"trigger" "gear_price_fetch_run_trigger" DEFAULT 'CRON' NOT NULL,
	"status" "gear_price_fetch_run_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"scanned_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"no_data_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "app"."gear_price_mappings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"gear_id" varchar(36) NOT NULL,
	"source_key" varchar(40) NOT NULL,
	"market_key" varchar(40) NOT NULL,
	"price_kind" varchar(40) DEFAULT 'used_retail' NOT NULL,
	"external_product_id" varchar(255),
	"canonical_url" text,
	"fetch_url" text,
	"status" "gear_price_mapping_status" DEFAULT 'ACTIVE' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_fetch_at" timestamp with time zone,
	"last_fetched_at" timestamp with time zone,
	"last_fetch_status" "gear_price_fetch_status" DEFAULT 'NEVER' NOT NULL,
	"last_fetch_error" text,
	"created_by_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."gear_price_observations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"mapping_id" varchar(36) NOT NULL,
	"value_kind" "gear_price_observation_value_kind" DEFAULT 'POINT' NOT NULL,
	"amount_minor" integer,
	"low_minor" integer,
	"high_minor" integer,
	"currency" varchar(3) NOT NULL,
	"condition" varchar(40) DEFAULT 'unknown' NOT NULL,
	"availability" varchar(40) DEFAULT 'available' NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone,
	"evidence_url" text,
	"note" text,
	"status" "gear_price_observation_status" DEFAULT 'VALID' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"created_by_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."gear" ADD COLUMN "used_price_projection" jsonb;--> statement-breakpoint
ALTER TABLE "app"."gear_price_estimates" ADD CONSTRAINT "gear_price_estimates_gear_id_gear_id_fk" FOREIGN KEY ("gear_id") REFERENCES "app"."gear"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gear_price_fetch_run_items" ADD CONSTRAINT "gear_price_fetch_run_items_run_id_gear_price_fetch_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "app"."gear_price_fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gear_price_fetch_run_items" ADD CONSTRAINT "gear_price_fetch_run_items_mapping_id_gear_price_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "app"."gear_price_mappings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gear_price_fetch_run_items" ADD CONSTRAINT "gear_price_fetch_run_items_gear_id_gear_id_fk" FOREIGN KEY ("gear_id") REFERENCES "app"."gear"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gear_price_mappings" ADD CONSTRAINT "gear_price_mappings_gear_id_gear_id_fk" FOREIGN KEY ("gear_id") REFERENCES "app"."gear"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gear_price_mappings" ADD CONSTRAINT "gear_price_mappings_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "app"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gear_price_observations" ADD CONSTRAINT "gear_price_observations_mapping_id_gear_price_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "app"."gear_price_mappings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gear_price_observations" ADD CONSTRAINT "gear_price_observations_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "app"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gear_price_estimates_gear_idx" ON "app"."gear_price_estimates" USING btree ("gear_id");--> statement-breakpoint
CREATE INDEX "gear_price_estimates_market_idx" ON "app"."gear_price_estimates" USING btree ("market_key","price_kind");--> statement-breakpoint
CREATE INDEX "gear_price_estimates_as_of_idx" ON "app"."gear_price_estimates" USING btree ("as_of");--> statement-breakpoint
CREATE INDEX "gear_price_fetch_run_items_run_idx" ON "app"."gear_price_fetch_run_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "gear_price_fetch_run_items_mapping_idx" ON "app"."gear_price_fetch_run_items" USING btree ("mapping_id");--> statement-breakpoint
CREATE INDEX "gear_price_fetch_runs_started_idx" ON "app"."gear_price_fetch_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "gear_price_mappings_gear_idx" ON "app"."gear_price_mappings" USING btree ("gear_id");--> statement-breakpoint
CREATE INDEX "gear_price_mappings_due_idx" ON "app"."gear_price_mappings" USING btree ("status","next_fetch_at");--> statement-breakpoint
CREATE INDEX "gear_price_mappings_source_market_idx" ON "app"."gear_price_mappings" USING btree ("source_key","market_key");--> statement-breakpoint
CREATE UNIQUE INDEX "gear_price_mappings_identity_uidx" ON "app"."gear_price_mappings" USING btree ("gear_id","source_key","market_key","price_kind");--> statement-breakpoint
CREATE INDEX "gear_price_observations_mapping_idx" ON "app"."gear_price_observations" USING btree ("mapping_id");--> statement-breakpoint
CREATE INDEX "gear_price_observations_observed_idx" ON "app"."gear_price_observations" USING btree ("observed_at","status");--> statement-breakpoint
CREATE INDEX "gear_price_observations_review_idx" ON "app"."gear_price_observations" USING btree ("needs_review","created_at");