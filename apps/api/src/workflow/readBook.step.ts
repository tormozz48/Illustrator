import type { makeSetStatus } from "./setStatus.js";

interface Ctx {
  readonly setStatus: ReturnType<typeof makeSetStatus>;
  readonly BOOKS_BUCKET: R2Bucket;
  readonly r2Key: string;
}

export async function readBookStep({
  setStatus,
  BOOKS_BUCKET,
  r2Key,
}: Ctx): Promise<string> {
  await setStatus("analyzing");
  const obj = await BOOKS_BUCKET.get(r2Key);
  if (!obj) throw new Error(`R2 object not found: ${r2Key}`);
  return obj.text();
}
