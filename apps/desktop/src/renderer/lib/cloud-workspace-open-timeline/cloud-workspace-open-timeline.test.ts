import { describe, expect, it } from "bun:test";
import {
	cloudWorkspaceOpenedProperties,
	recordCloudWorkspaceCreateStart,
	takeCloudWorkspaceCreateStart,
} from "./cloud-workspace-open-timeline";

const T0 = 1_789_000_000_000;

describe("cloudWorkspaceOpenedProperties", () => {
	it("carries create→ready and ready→first-200 for a create", () => {
		const properties = cloudWorkspaceOpenedProperties(
			{
				workspaceId: "ws-1",
				kind: "create",
				createStartedAt: T0,
				openedAt: T0 + 300,
				readyAt: T0 + 8_200,
				accessAt: T0 + 9_100,
				firstResponseAt: T0 + 9_650,
				firstTerminalAt: T0 + 10_400,
			},
			{
				createdAt: new Date(T0 + 120).toISOString(),
				provisionStartedAt: new Date(T0 + 400),
				sandboxCreateStartedAt: new Date(T0 + 1_100),
				sandboxCreateFinishedAt: new Date(T0 + 7_300),
				bootFiredAt: new Date(T0 + 7_900),
				firstHealthyAt: new Date(T0 + 9_050),
			},
		);
		expect(properties).toEqual({
			workspace_id: "ws-1",
			kind: "create",
			create_to_ready_ms: 8_200,
			ready_to_access_ms: 900,
			ready_to_first_200_ms: 1_450,
			ready_to_first_terminal_ms: 2_200,
			open_to_first_200_ms: 9_350,
			server_create_to_job_start_ms: 280,
			server_job_start_to_sandbox_create_ms: 700,
			server_sandbox_create_ms: 6_200,
			server_sandbox_create_to_boot_fired_ms: 600,
			server_boot_fired_to_first_healthy_ms: 1_150,
		});
	});

	it("leaves the create duration and unseen stages null on a reopen", () => {
		const properties = cloudWorkspaceOpenedProperties({
			workspaceId: "ws-2",
			kind: "reopen",
			createStartedAt: null,
			openedAt: T0,
			readyAt: T0,
			accessAt: T0 + 6_000,
			firstResponseAt: T0 + 6_400,
			firstTerminalAt: null,
		});
		expect(properties.kind).toBe("reopen");
		expect(properties.create_to_ready_ms).toBeNull();
		expect(properties.ready_to_first_200_ms).toBe(6_400);
		expect(properties.ready_to_first_terminal_ms).toBeNull();
		expect(properties.server_sandbox_create_ms).toBeNull();
	});
});

describe("create start marks", () => {
	it("hands a recorded start to exactly one taker", () => {
		recordCloudWorkspaceCreateStart("ws-3", T0);
		expect(takeCloudWorkspaceCreateStart("ws-3")).toBe(T0);
		expect(takeCloudWorkspaceCreateStart("ws-3")).toBeNull();
		expect(takeCloudWorkspaceCreateStart("never-created")).toBeNull();
	});
});
