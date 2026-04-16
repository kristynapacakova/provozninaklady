import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Naklad = {
  id: string
  mesic: number
  rok: number
  nazev: string
  ucet_bez_dph: number
  cl_bez_dph: number
  ucet_s_dph: number
  cl_s_dph: number
  dph_sazba: number
  pravidelnost: string
  kategorie: string
  stav: 'ok' | 'chybi' | 'rozdil'
  poznamka: string
  poradi: number
}
