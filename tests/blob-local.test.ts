import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { blobConfigured, deleteBlob, listBlobPaths, readBlob, writeBlob } from "@/lib/blob";

describe("local blob backend (dev/test only)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kalam-blob-"));
  process.env.KALAM_LOCAL_BLOB_DIR = dir;
  afterAll(() => {
    delete process.env.KALAM_LOCAL_BLOB_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes, reads, lists and deletes", async () => {
    expect(blobConfigured()).toBe(true);
    await writeBlob("cards/a.json", "{}", "application/json");
    await writeBlob("cards/b.json", "[]", "application/json");
    expect((await readBlob("cards/a.json"))?.toString()).toBe("{}");
    expect((await listBlobPaths("cards/")).sort()).toEqual(["cards/a.json", "cards/b.json"]);
    await deleteBlob("cards/a.json");
    expect(await readBlob("cards/a.json")).toBeNull();
  });

  it("refuses paths outside its folder", async () => {
    await expect(writeBlob("../escape.json", "x", "application/json")).rejects.toThrow(/bad blob path/);
  });
});
