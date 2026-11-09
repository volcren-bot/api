import { Elysia } from "elysia"
import { logError } from "./request"
import { profiles, verifyToken } from "./supabase"
import { AuthHeaders } from "./types/collection"

export interface Caller {
	id: string
	token: string
	username: string
	avatar: string
	role: string
}

type AuthResult =
	| { caller: Caller; code: 200; error: null }
	| { caller: null; code: 401 | 403 | 500; error: string }

export function bearerToken(header: string | undefined | null) {
	return header?.match(/^Bearer (\S+)$/i)?.[1] ?? null
}

/** 401 is retryable after a refresh, 403 is not. */
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

/** `auth: true` on a route requires the bearer header and hands the handler the `caller`. */
export const auth = new Elysia({ name: "auth" }).macro({
	auth: {
		headers: AuthHeaders,
		detail: { security: [{ bearerAuth: [] }] },
		async resolve({ headers, status }) {
			const result = await authenticate(headers.authorization)
			if (result.error != null) return status(result.code, { error: result.error })
			return { caller: result.caller }
		}
	}
})
