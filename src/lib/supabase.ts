import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { env, supabaseStorageEnabled } from '../config/env.js';

/**
 * Server-side Supabase client using the service-role key. Used only for Storage
 * (receipt images). All relational data goes through Prisma, not Supabase's
 * PostgREST layer, so we never expose the service key to clients.
 */
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!supabaseStorageEnabled) {
    throw new Error(
      'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  if (!client) {
    client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** How long a signed receipt URL stays valid. Long enough to open and read. */
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Upload a receipt file (image or PDF) and return its storage path.
 *
 * Deliberately returns the path rather than a URL: the receipts bucket is
 * private, because order confirmations routinely carry a purchaser's name and
 * shipping address. A URL is minted on demand by `createSignedReceiptUrl` and
 * expires, so access can be revoked; a stored public URL never could be.
 *
 * Files are namespaced by team so listing and cleanup stay scoped.
 */
export async function uploadReceiptFile(params: {
  teamId: string;
  buffer: Buffer;
  contentType: string;
  originalName?: string;
}): Promise<{ path: string }> {
  const supabase = getClient();
  const bucket = env.SUPABASE_RECEIPTS_BUCKET;
  const ext = extensionFor(params.contentType, params.originalName);
  const path = `${params.teamId}/${randomUUID()}${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, params.buffer, { contentType: params.contentType, upsert: false });

  if (error) {
    throw new Error(`Failed to upload receipt file: ${error.message}`);
  }

  return { path };
}

/**
 * Mint a short-lived URL for a stored receipt file.
 *
 * The caller is responsible for checking that the requester may see this
 * receipt — the signed URL itself carries no identity, so it must only ever be
 * handed to an already-authorised caller.
 */
export async function createSignedReceiptUrl(
  path: string,
  expiresInSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(env.SUPABASE_RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Failed to sign receipt URL: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
}

function extensionFor(contentType: string, originalName?: string): string {
  const fromName = originalName?.match(/\.[a-z0-9]+$/i)?.[0];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'application/pdf': '.pdf',
  };
  return map[contentType] ?? '';
}
