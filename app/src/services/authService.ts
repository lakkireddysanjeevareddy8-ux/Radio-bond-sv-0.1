import { supabase } from './supabaseClient';

export const AuthService = {
  async signInWithGoogle() {
    const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: redirectUrl ? { redirectTo: redirectUrl } : undefined,
    });
    return { data, error };
  },
  async signInWithEmail(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  },
  async signUpWithEmail(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  },
  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  },
};
