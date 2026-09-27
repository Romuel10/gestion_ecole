import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

if (!url || !publishableKey) {
  console.warn(
    'Sekoly Enseignant: configurez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: globalThis.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});


export async function acceptAuthDeepLink(url: string) {
  const [base, fragment = ''] = url.split('#');
  const parsed = new URL(base);
  const fragmentParams = new URLSearchParams(fragment);

  const code = parsed.searchParams.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return { session: data.session, type: parsed.searchParams.get('type') };
  }

  const accessToken =
    fragmentParams.get('access_token') || parsed.searchParams.get('access_token');
  const refreshToken =
    fragmentParams.get('refresh_token') || parsed.searchParams.get('refresh_token');
  const type =
    fragmentParams.get('type') || parsed.searchParams.get('type');

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return { session: data.session, type };
  }

  return { session: null, type };
}
