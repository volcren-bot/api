import { createClient } from "@supabase/supabase-js"
import type { Database } from "./types/supabase"

const authOptions = {
	auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
}

/** Bypasses RLS; the session and stats functions are service_role only. */
export const supabaseAdmin = createClient<Database>(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_KEY,
	authOptions
)

/** Verifies access tokens. Never signs in. */
const supabaseAnon = createClient<Database>(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_ANON_KEY,
	authOptions
)

/** The `scripts` schema as the user, so row level security decides what they can see. */
export const userScripts = (accessToken: string) =>
	createClient<Database>(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
		...authOptions,
		global: { headers: { Authorization: `Bearer ${accessToken}` } }
	}).schema("scripts")

export async function verifyToken(accessToken: string) {
	const { data, error } = await supabaseAnon.auth.getClaims(accessToken)
	return (!error && data?.claims.sub) || null
}

export const payments = supabaseAdmin.schema("payments")
export const stats = supabaseAdmin.schema("stats")
export const scripts = supabaseAdmin.schema("scripts")
export const profiles = supabaseAdmin.schema("profiles")
export const feedback = supabaseAdmin.schema("feedback")
