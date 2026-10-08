CREATE TABLE "app"."developer_webhook_deliveries" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" varchar(36) NOT NULL,
	"target_id" varchar(36) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_status_code" integer,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."developer_webhook_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"gear_id" varchar(36) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."developer_webhook_targets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"endpoint_url" text NOT NULL,
	"signing_secret_ciphertext" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."developer_webhook_deliveries" ADD CONSTRAINT "developer_webhook_deliveries_event_id_developer_webhook_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."developer_webhook_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."developer_webhook_deliveries" ADD CONSTRAINT "developer_webhook_deliveries_target_id_developer_webhook_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "app"."developer_webhook_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."developer_webhook_targets" ADD CONSTRAINT "developer_webhook_targets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developer_webhook_deliveries_identity_uidx" ON "app"."developer_webhook_deliveries" USING btree ("event_id","target_id");--> statement-breakpoint
CREATE INDEX "developer_webhook_deliveries_due_idx" ON "app"."developer_webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_webhook_events_identity_uidx" ON "app"."developer_webhook_events" USING btree ("event_type","gear_id");--> statement-breakpoint
CREATE INDEX "developer_webhook_targets_user_idx" ON "app"."developer_webhook_targets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "developer_webhook_targets_event_idx" ON "app"."developer_webhook_targets" USING btree ("event_type","is_enabled");