ALTER TABLE "environments" ADD COLUMN "bundle_sha" text;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "hooks" jsonb;