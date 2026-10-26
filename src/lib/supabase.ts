import { createClient } from "@supabase/supabase-js"
import type { Database } from "./types/supabase"

const authOptions = {
	auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
}

/** Bypasses RLS: the session and stats functions are service_role only. Holds no session, so one client is shared. */
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

/** A client that acts as the user, so row level security decides what they can see. */
export function createUserClient(accessToken: string) {
	return createClient<Database>(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
		...authOptions,
		global: { headers: { Authorization: `Bearer ${accessToken}` } }
	})
}

export async function verifyToken(accessToken: string) {
	const { data, error } = await supabaseAnon.auth.getClaims(accessToken)
	const id = data?.claims.sub
	if (error || !id) return null
	return id
}

export const payments = () => supabaseAdmin.schema("payments")
export const stats = () => supabaseAdmin.schema("stats")
export const scripts = () => supabaseAdmin.schema("scripts")
export const profiles = () => supabaseAdmin.schema("profiles")
