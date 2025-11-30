import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL ERROR: Supabase URL or Key is missing!');
    console.error('Please ensure you have a .env file in the "frontend" directory with VITE_SUPABASE_URL and VITE_SUPABASE_KEY.');
}

export const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : { from: () => ({ select: () => Promise.reject("Supabase not initialized") }) }; // Dummy client to prevent immediate crash
