import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";

// Private Vercel Blob store: nothing is readable without the token, so every read goes through our routes.
const ACCESS = "private" as const;

// Dev/test only: KALAM_LOCAL_BLOB_DIR stores blobs as files in that folder instead (never set on Vercel).
const localDir = () => process.env.KALAM_LOCAL_BLOB_DIR;
const localPath = (pathname: string) => {
  const full = path.resolve(localDir()!, pathname);
  if (!full.startsWith(path.resolve(localDir()!) + path.sep)) throw new Error(`bad blob path: ${pathname}`);
  return full;
};

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || localDir());

export async function readBlob(pathname: string, opts: { fresh?: boolean } = {}): Promise<Buffer | null> {
  if (localDir()) return readFile(localPath(pathname)).catch(() => null);
  const result = await get(pathname, { access: ACCESS, useCache: !opts.fresh });
  if (!result || result.statusCode !== 200) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function writeBlob(pathname: string, body: Buffer | string, contentType: string): Promise<void> {
  if (localDir()) {
    await mkdir(path.dirname(localPath(pathname)), { recursive: true });
    return writeFile(localPath(pathname), body);
  }
  await put(pathname, body, { access: ACCESS, contentType, addRandomSuffix: false, allowOverwrite: true });
}

export async function listBlobPaths(prefix: string): Promise<string[]> {
  if (localDir()) {
    const dir = localPath(prefix.endsWith("/") ? prefix : path.dirname(prefix));
    const names = await readdir(dir).catch(() => [] as string[]);
    return names.map((n) => path.posix.join(prefix.endsWith("/") ? prefix : path.posix.dirname(prefix) + "/", n)).filter((p) => p.startsWith(prefix));
  }
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    paths.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return paths;
}

export async function deleteBlob(pathname: string): Promise<void> {
  if (localDir()) return rm(localPath(pathname), { force: true });
  await del(pathname);
}
