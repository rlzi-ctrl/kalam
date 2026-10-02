import { del, get, list, put } from "@vercel/blob";

// Private Vercel Blob store: nothing is readable without the token, so every read goes through our routes.
const ACCESS = "private" as const;

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function readBlob(pathname: string, opts: { fresh?: boolean } = {}): Promise<Buffer | null> {
  const result = await get(pathname, { access: ACCESS, useCache: !opts.fresh });
  if (!result || result.statusCode !== 200) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function writeBlob(pathname: string, body: Buffer | string, contentType: string): Promise<void> {
  await put(pathname, body, { access: ACCESS, contentType, addRandomSuffix: false, allowOverwrite: true });
}

export async function listBlobPaths(prefix: string): Promise<string[]> {
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
  await del(pathname);
}
