import { Sandbox } from "@vercel/sandbox";

const credentials = {
	token: process.env.VERCEL_SANDBOX_TOKEN!,
	teamId: process.env.VERCEL_SANDBOX_TEAM_ID!,
	projectId: process.env.VERCEL_SANDBOX_PROJECT_ID!,
};
const name = process.argv[2]!;
const sandbox = await Sandbox.get({ ...credentials, name });
console.log(
	"status",
	sandbox.status,
	"vcpus",
	sandbox.vcpus,
	"region",
	sandbox.region,
);
for (const cmd of process.argv.slice(3)) {
	const r = await sandbox.runCommand({
		cmd: "bash",
		args: ["-lc", cmd],
		sudo: true,
	});
	console.log(
		`--- ${cmd} (exit ${r.exitCode})\n${await r.stdout()}${await r.stderr()}`,
	);
}
