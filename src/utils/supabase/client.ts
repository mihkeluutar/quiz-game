
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

if (!projectId || !publicAnonKey) {
  throw new Error('Supabase environment variables VITE_SUPABASE_PROJECT_ID and VITE_SUPABASE_ANON_KEY are required.');
}

const supabaseUrl = `https://${projectId}.supabase.co`;
export const supabase = createClient(supabaseUrl, publicAnonKey);
