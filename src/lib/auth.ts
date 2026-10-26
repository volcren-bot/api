import { logError } from "./request"
import { profiles, verifyToken } from "./supabase"

export interface Caller {
	id: string
	token: string
	username: string
	avatar: string
	role: string
}

export type AuthResult =
	| { caller: Caller; code: 200; error: null }
	| { caller: null; code: 401 | 403 | 500; error: string }

export function bearerToken(header: string | undefined | null) {
	return header?.match(/^Bearer (\S+)$/i)?.[1] ?? null
}

/**
 * Every launcher endpoint starts here. 401 means the token is missing, invalid or expired, so the
 * launcher refreshes it and tries again. A deleted or banned account is a 403, which it must not retry.
 */
export async function authenticate(header: string | undefined | null): Promise<AuthResult> {
	const token = bearerToken(header)
	if (!token) return { caller: null, code: 401, error: "Missing access token." }

	const id = await verifyToken(token)
	if (!id) return { caller: null, code: 401, error: "Your session is invalid or has expired." }

	const { data, error } = await profiles()
		.from("profiles")
		.select("id, username, avatar, role, banned_at")
		.eq("id", id)
		.single()

	if (error) {
		// PGRST116: no rows found, the account was deleted
		if (error.code === "PGRST116")
			return { caller: null, code: 403, error: "This account no longer exists." }
		return { caller: null, code: 500, error: logError("Failed to load your account.", error) }
	}

	if (data.banned_at) return { caller: null, code: 403, error: "This account is banned." }

	return {
		caller: { id: data.id, token, username: data.username, avatar: data.avatar, role: data.role },
		code: 200,
		error: null
	}
}
