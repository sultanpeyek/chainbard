CREATE TABLE "mint_runs" (
	"intent_id" text PRIMARY KEY NOT NULL,
	"input_hash" text NOT NULL,
	"buyer" text NOT NULL,
	"settled_sig" text,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mint_runs_state_check" CHECK ("mint_runs"."state" IN ('settling', 'settled', 'published'))
);
--> statement-breakpoint
CREATE INDEX "mint_runs_input_hash_idx" ON "mint_runs" USING btree ("input_hash");