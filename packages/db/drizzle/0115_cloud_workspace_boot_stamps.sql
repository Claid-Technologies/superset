ALTER TABLE "cloud_workspaces" ADD COLUMN "provision_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "sandbox_create_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "sandbox_create_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "boot_fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "first_healthy_at" timestamp with time zone;