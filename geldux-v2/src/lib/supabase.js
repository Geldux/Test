import { createClient } from '@supabase/supabase-js'

const _url  = import.meta.env.VITE_SUPABASE_URL      ?? ''
const _key  = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase     = (_url && _key) ? createClient(_url, _key) : null
export const HAS_SUPABASE = Boolean(supabase)
