/**
 * What an account's trust store says about one folder. "declined" is an
 * explicit refusal the host must never work around; "none" is the ordinary
 * never-asked state.
 */
export type FolderTrustDecision = "trusted" | "declined" | "none";

/**
 * One agent CLI's folder-trust mechanics. Adding a CLI means adding one of
 * these to FOLDER_TRUST_PROVIDERS; the policy in folder-trust.ts is shared.
 */
export interface FolderTrustProvider {
	/** Matched against the preset id and the launch executable's basename. */
	family: string;
	/** Trust store of the account a launch with this env runs under. */
	storeFile(env: Record<string, string>): string;
	/** Trust stores of every account of this CLI found on the machine. */
	discoverStoreFiles(): Promise<string[]>;
	/** A missing or unreadable store decides nothing. */
	readDecision(
		storeFile: string,
		folderPath: string,
	): Promise<FolderTrustDecision>;
	/**
	 * Record acceptance in the store. Throws rather than clobbering a store it
	 * cannot parse, and never overrides a "declined".
	 */
	persist(storeFile: string, folderPath: string): Promise<void>;
	/**
	 * Args that trust `folderPaths` for one launch without touching the store.
	 * Preferred over `persist` for trust carried between accounts: nothing
	 * accumulates in a config file the user owns.
	 */
	launchOverride?(folderPaths: string[]): string[];
}
