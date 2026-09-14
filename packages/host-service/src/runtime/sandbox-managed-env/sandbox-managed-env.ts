/**
 * The managed environment of a cloud workspace sandbox: the environment's
 * variables and the credential placeholders the control plane pushes after
 * boot, held in memory and replaced as a whole on every push. New terminals
 * and agent launches inherit it; nothing writes it to disk, and a restart
 * waits for the control plane to push it again.
 */
let managed: Record<string, string> | null = null;
let firstPush: Promise<void>;
let resolveFirstPush: () => void = () => {};

function reset(): void {
	firstPush = new Promise<void>((resolve) => {
		resolveFirstPush = resolve;
	});
}
reset();

export function setManagedEnv(variables: Record<string, string>): void {
	managed = { ...variables };
	resolveFirstPush();
}

/** The current set, or empty until the first push. */
export function getManagedEnv(): Record<string, string> {
	return managed ? { ...managed } : {};
}

export function hasManagedEnv(): boolean {
	return managed !== null;
}

/** Resolves once the control plane has pushed at least once this process. */
export function waitForManagedEnv(timeoutMs: number): Promise<boolean> {
	return Promise.race([
		firstPush.then(() => true),
		new Promise<boolean>((resolve) =>
			setTimeout(() => resolve(false), timeoutMs),
		),
	]);
}

export function resetManagedEnvForTests(): void {
	managed = null;
	reset();
}
