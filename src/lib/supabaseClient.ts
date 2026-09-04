import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = ((import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL as string) || '';
const supabaseAnonKey = ((import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY as string) || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient;

if (isSupabaseConfigured) {
  client = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Placeholder client so the app can run fully offline (localStorage only) without Supabase.
  // Every query builder method is chainable and resolves to an empty, error-free result so
  // callers never need to special-case the unconfigured state.
  const notConfigured = { message: 'Supabase not configured' };
  const makeBuilder = (readError: boolean): any => {
    const result = { data: readError ? [] : null, error: readError ? notConfigured : null };
    const builder: any = {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    const chain = () => builder;
    ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'neq', 'in', 'not', 'is', 'order', 'limit'].forEach(
      (m) => (builder[m] = chain)
    );
    return builder;
  };
  client = {
    from: () => ({
      select: () => makeBuilder(true),
      insert: () => makeBuilder(false),
      upsert: () => makeBuilder(false),
      update: () => makeBuilder(false),
      delete: () => makeBuilder(false),
    }),
  } as unknown as SupabaseClient;
}

export const supabase = client;
