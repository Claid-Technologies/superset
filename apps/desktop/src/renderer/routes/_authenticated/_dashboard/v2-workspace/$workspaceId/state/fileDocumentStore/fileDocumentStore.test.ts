import { expect, test } from "bun:test";
import {
	acquireDocument,
	dispatchFsEvent,
	releaseDocument,
} from "./fileDocumentStore";

test("a failed host save preserves the dirty document across pane reopen and explicit retry", async () => {
	let online = false;
	let writes = 0;
	const client = {
		filesystem: {
			readFile: {
				query: async () => ({
					kind: "text",
					content: "original",
					revision: "revision-1",
					byteLength: 8,
				}),
			},
			writeFile: {
				mutate: async () => {
					writes++;
					if (!online) throw new Error("Host disconnected");
					return { ok: true, revision: "revision-2" };
				},
			},
		},
	} as unknown as Parameters<typeof acquireDocument>[2];
	const workspaceId = crypto.randomUUID();
	const path = "/workspace/reconnect.txt";
	const doc = acquireDocument(workspaceId, path, client);
	await Promise.resolve();
	expect(doc.content.kind).toBe("text");
	doc.setContent("unsaved work");
	expect((await doc.save()).status).toBe("error");
	expect(doc.saveError?.message).toBe("Host disconnected");
	expect(doc.pendingSave).toBe(false);
	expect(doc.dirty).toBe(true);
	expect(doc.content).toMatchObject({ value: "unsaved work" });
	releaseDocument(workspaceId, path);

	const reopened = acquireDocument(workspaceId, path, client);
	expect(reopened.id).toBe(doc.id);
	expect(reopened.dirty).toBe(true);
	online = true;
	expect(writes).toBe(1);
	expect((await reopened.save()).status).toBe("saved");
	expect(reopened.dirty).toBe(false);
	expect(reopened.saveError).toBeNull();
	expect(reopened.content).toMatchObject({ value: "unsaved work" });
	expect(writes).toBe(2);
	releaseDocument(workspaceId, path);
});

function createReloadFixture() {
	type ReadResult = {
		kind: "text";
		content: string;
		revision: string;
		byteLength: number;
	};
	const reads: Array<ReturnType<typeof Promise.withResolvers<ReadResult>>> = [];
	const client = {
		filesystem: {
			readFile: {
				query: () => {
					const read = Promise.withResolvers<ReadResult>();
					reads.push(read);
					return read.promise;
				},
			},
			writeFile: {
				mutate: async () => ({ ok: true, revision: "saved-revision" }),
			},
		},
	} as unknown as Parameters<typeof acquireDocument>[2];
	const workspaceId = crypto.randomUUID();
	const absolutePath = "/workspace/.env";
	const doc = acquireDocument(workspaceId, absolutePath, client);
	return {
		doc,
		workspaceId,
		reads,
		update: () =>
			dispatchFsEvent(workspaceId, { kind: "update", absolutePath }),
		overflow: () =>
			dispatchFsEvent(workspaceId, {
				kind: "overflow",
				absolutePath: "/workspace",
			}),
		remove: () =>
			dispatchFsEvent(workspaceId, { kind: "delete", absolutePath }),
		resolve: async (index: number, content: string) => {
			reads[index].resolve({
				kind: "text",
				content,
				revision: content,
				byteLength: content.length,
			});
			await Promise.resolve();
		},
		cleanup: async () => {
			if (doc.dirty) await doc.save();
			releaseDocument(workspaceId, doc.absolutePath);
		},
	};
}

test("external reload preserves edits made while the disk read is pending", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "EMAIL=original");
	f.update();
	f.doc.setContent("EMAIL=edited");
	await f.resolve(1, "EMAIL=original\nTOKEN=generated");
	expect(f.doc.content).toMatchObject({
		value: "EMAIL=edited",
		revision: "EMAIL=original",
	});
	expect(f.doc.dirty).toBe(true);
	expect(f.doc.hasExternalChange).toBe(true);
	await f.cleanup();
});

test("external reloads cannot complete out of order and restore stale disk content", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.update();
	await f.resolve(2, "newest");
	await f.resolve(1, "stale");
	expect(f.doc.content).toMatchObject({ value: "newest", revision: "newest" });
	expect(f.doc.dirty).toBe(false);
	await f.cleanup();
});

test("watcher overflow reloads open files beneath the watched root and preserves dirty buffers", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.overflow();
	expect(f.reads).toHaveLength(2);
	await f.resolve(1, "TOKEN=generated");
	expect(f.doc.content).toMatchObject({ value: "TOKEN=generated" });
	f.doc.setContent("EMAIL=edited");
	f.overflow();
	expect(f.doc.content).toMatchObject({ value: "EMAIL=edited" });
	expect(f.doc.hasExternalChange).toBe(true);
	expect(f.reads).toHaveLength(2);
	await f.cleanup();
});

test("a stale reload error cannot replace edits made during the read", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.doc.setContent("unsaved");
	f.reads[1].reject(new Error("ENOENT"));
	await Promise.resolve();
	expect(f.doc.content).toMatchObject({ value: "unsaved" });
	expect(f.doc.dirty).toBe(true);
	await f.cleanup();
});

test("a reload started before a save cannot roll back the saved revision", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.doc.setContent("saved edits");
	await f.doc.save();
	await f.resolve(1, "original");
	expect(f.doc.content).toMatchObject({
		value: "saved edits",
		revision: "saved-revision",
	});
	expect(f.doc.dirty).toBe(false);
	await f.cleanup();
});

test("a reload started before deletion cannot clear the orphaned state", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.remove();
	await f.resolve(1, "original");
	expect(f.doc.orphaned).toBe(true);
	f.update();
	await f.resolve(2, "recreated");
	expect(f.doc.orphaned).toBe(false);
	await f.cleanup();
});

test("a rename during initial load reads the new path instead of leaving the document loading", async () => {
	const f = createReloadFixture();
	dispatchFsEvent(f.workspaceId, {
		kind: "rename",
		oldAbsolutePath: "/workspace/.env",
		absolutePath: "/workspace/.env.local",
	});
	await f.resolve(1, "renamed content");
	await f.resolve(0, "old content");
	expect(f.doc.absolutePath).toBe("/workspace/.env.local");
	expect(f.doc.content).toMatchObject({ value: "renamed content" });
	await f.cleanup();
});

test("an older read failure cannot replace a newer successful reload", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.update();
	await f.resolve(2, "newest");
	f.reads[1].reject(new Error("ENOENT"));
	await Promise.resolve();
	expect(f.doc.content).toMatchObject({ value: "newest" });
	await f.cleanup();
});

test("overflow in another workspace does not reload this document", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	dispatchFsEvent(crypto.randomUUID(), {
		kind: "overflow",
		absolutePath: "/workspace",
	});
	expect(f.reads).toHaveLength(1);
	await f.cleanup();
});
