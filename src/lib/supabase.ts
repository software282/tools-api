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

/**
 * Upload a receipt image and return the storage path plus a public URL.
 * Files are namespaced by team so listing/cleanup stays scoped.
 */
export async function uploadReceiptImage(params: {
  teamId: string;
  buffer: Buffer;
  contentType: string;
  originalName?: string;
}): Promise<{ path: string; url: string }> {
  const supabase = getClient();
  const bucket = env.SUPABASE_RECEIPTS_BUCKET;
  const ext = extensionFor(params.contentType, params.originalName);
  const path = `${params.teamId}/${randomUUID()}${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, params.buffer, { contentType: params.contentType, upsert: false });

  if (error) {
    throw new Error(`Failed to upload receipt image: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, url: data.publicUrl };
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
