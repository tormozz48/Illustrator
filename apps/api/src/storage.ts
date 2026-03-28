import { S3Client, PutObjectCommand, type PutObjectCommandInput } from '@aws-sdk/client-s3';
import { env } from './env.js';

/**
 * Cloudflare R2 client (S3-compatible)
 */
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload file to R2 storage
 * @returns Public URL of uploaded file
 */
export async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const params: PutObjectCommandInput = {
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  };

  await r2Client.send(new PutObjectCommand(params));

  return `${env.R2_PUBLIC_URL}/${key}`;
}
