import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// When env vars are missing, App renders a setup screen instead of crashing on import.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
);

// Auth email links must point at the web app, not the Capacitor webview (https://localhost).
const siteUrl = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '');

const entity = (name) => {
  const tableNames = {
    Activity: 'activities',
    NotificationLog: 'notificationlogs',
    PaymentSetting: 'paymentsettings',
  };
  const table = tableNames[name] || `${name.toLowerCase()}s`;

  return {
    async list(order = '-created_date', limit) {
      const descending = order.startsWith('-');
      const column = descending ? order.slice(1) : order;
      let query = supabase.from(table).select('*').order(column, { ascending: !descending });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    async filter(filters = {}) {
      let query = supabase.from(table).select('*');
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) query = query.eq(key, value);
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    async create(values) {
      const { data, error } = await supabase.from(table).insert(values).select().single();
      if (error) throw error;
      return data;
    },
    async bulkCreate(values) {
      const { data, error } = await supabase.from(table).insert(values).select();
      if (error) throw error;
      return data || [];
    },
    async update(id, values) {
      const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    subscribe(callback) {
      const channel = supabase
        .channel(`${table}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
};

/** @type {Record<string, ReturnType<typeof entity>>} */
const entities = new Proxy({}, { get: (_, name) => entity(name) });

export const db = {
  auth: {
    me: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      return {
        ...user,
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      };
    },
    loginViaEmailPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    register: async ({ email, password, full_name }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name },
          emailRedirectTo: `${siteUrl}/auth/confirm`,
        },
      });
      if (error) throw error;
      return data;
    },
    confirmEmail: async (tokenHash, type = 'signup') => {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) throw error;
      await supabase.auth.signOut();
    },
    exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
    resetPasswordRequest: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/reset-password`,
      });
      if (error) throw error;
    },
    resetPassword: async ({ newPassword }) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    logout: async () => { await supabase.auth.signOut(); },
    redirectToLogin: () => { window.location.assign('/login'); },
  },
  entities,
  integrations: {
    Core: {
      UploadPublicFile: async ({ file }) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        // Storage policies only allow writes inside the uploader's own folder.
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'proof';
        const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage.from('payment-proofs').upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from('payment-proofs').getPublicUrl(path);
        return { file_url: data.publicUrl };
      },
    },
  },
};

export default db;
