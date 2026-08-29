import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = ((import.meta.env as any).NEXT_PUBLIC_SUPABASE_URL as string) || '';
const supabaseAnonKey = ((import.meta.env as any).NEXT_PUBLIC_SUPABASE_ANON_KEY as string) || '';

let client: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  client = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Placeholder client so the app can run without Supabase configured.
  client = {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: { message: 'Supabase not configured' } as any }),
      upsert: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } as any }),
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } as any }),
      }),
      delete: () => ({
        eq: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } as any }),
      }),
    }),
  } as unknown as SupabaseClient;
}

export const supabase = client;
