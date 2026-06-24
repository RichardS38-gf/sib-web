// js/supabase.js — SIB
// Supabase Client Initialisierung

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://ezruwstzpncunbjzwdfk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6cnV3c3R6cG5jdW5ianp3ZGZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTk4NDAsImV4cCI6MjA5Nzg3NTg0MH0.ema49XcFgwUrUMHsPZFgx5Aqoiyqsj1khjd0qnmAvhM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
