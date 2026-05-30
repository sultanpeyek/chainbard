CREATE TABLE "agent_state" (
	"key" text PRIMARY KEY NOT NULL,
	"dormant" boolean DEFAULT false NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
