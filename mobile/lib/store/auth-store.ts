import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import * as SecureStore from 'expo-secure-store';
import type { User, BYOKConfig, Provider, AllowedModel } from '@/shared/types';
import { validateModel } from '@/constants/byok';

interface AuthState {
  user: User | null;
  session: any | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  byokConfig: BYOKConfig | null;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setBYOKConfig: (provider: Provider, model: AllowedModel, apiKey: string) => Promise<{ error: string | null }>;
  loadBYOKConfig: () => Promise<void>;
  clearBYOKConfig: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  byokConfig: null,
  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('User')
          .select('*')
          .eq('email', session.user.email)
          .single();

        set({
          session,
          user: profile || null,
          isAuthenticated: true,
          isLoading: false,
        });

        // Load BYOK config from secure storage
        await get().loadBYOKConfig();
      } else {
        set({ isLoading: false });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
          set({ user: null, session: null, isAuthenticated: false, byokConfig: null });
        } else if (session) {          const { data: profile } = await supabase
            .from('User')
            .select('*')
            .eq('email', session.user.email)
            .single();

          set({
            session,
            user: profile || null,
            isAuthenticated: true,
          });
        }
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ isLoading: false });
    }
  },

  signIn: async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      return { error: e.message || 'Sign in failed' };
    }
  },  signUp: async (email, password, name) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      return { error: e.message || 'Sign up failed' };
    }
  },

  signOut: async () => {
    await get().clearBYOKConfig();
    await supabase.auth.signOut();
    set({ user: null, session: null, isAuthenticated: false, byokConfig: null });
  },

  setBYOKConfig: async (provider, model, apiKey) => {
    if (!validateModel(provider, model)) {
      return { error: `Model ${model} is not allowed for provider ${provider}` };
    }

    try {
      // Store API key in device keychain (iOS) / keystore (Android)
      await SecureStore.setItemAsync(`byok_${provider}_key`, apiKey);
      await SecureStore.setItemAsync('byok_active_provider', provider);
      await SecureStore.setItemAsync('byok_active_model', model);      const config: BYOKConfig = { provider, model, apiKey };
      set({ byokConfig: config });
      return { error: null };
    } catch (e: any) {
      return { error: e.message || 'Failed to save API key securely' };
    }
  },

  loadBYOKConfig: async () => {
    try {
      const provider = await SecureStore.getItemAsync('byok_active_provider') as Provider | null;
      const model = await SecureStore.getItemAsync('byok_active_model') as AllowedModel | null;
      
      if (provider && model) {
        const apiKey = await SecureStore.getItemAsync(`byok_${provider}_key`);
        if (apiKey) {
          set({ byokConfig: { provider, model, apiKey } });
        }
      }
    } catch (error) {
      console.error('Failed to load BYOK config:', error);
    }
  },

  clearBYOKConfig: async () => {
    try {
      const providers: Provider[] = ['anthropic', 'google', 'openai'];
      for (const p of providers) {
        await SecureStore.deleteItemAsync(`byok_${p}_key`);
      }
      await SecureStore.deleteItemAsync('byok_active_provider');
      await SecureStore.deleteItemAsync('byok_active_model');
      set({ byokConfig: null });
    } catch (error) {
      console.error('Failed to clear BYOK config:', error);
    }
  },
}));