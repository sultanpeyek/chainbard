CREATE TABLE IF NOT EXISTS "tick_log" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"signal_source" text NOT NULL,
	"candidates_considered" integer NOT NULL,
	"pick_kind" text NOT NULL,
	"pick_identifier" text NOT NULL,
	"pick_rationale" text NOT NULL,
	"ace_receipts" jsonb NOT NULL,
	"sentinel_call_sig" text,
	"memo_sig" text,
	"webhook_posted" boolean NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_stories" (
	"input_hash" text PRIMARY KEY NOT NULL,
	"input" text NOT NULL,
	"story" jsonb NOT NULL,
	"provenance" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"memo_sig" text,
	"payment_sig" text,
	CONSTRAINT "wallet_stories_provenance_check" CHECK ("wallet_stories"."provenance" IN ('seed', 'buyer', 'curator'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tick_log_started_at_idx" ON "tick_log" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tick_log_pick_identifier_idx" ON "tick_log" USING btree ("pick_identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_stories_input_idx" ON "wallet_stories" USING btree ("input");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_stories_created_at_idx" ON "wallet_stories" USING btree ("created_at" DESC NULLS LAST);
