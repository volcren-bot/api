import { Elysia } from "elysia"
import { fail, ok, reply, serverError, type Outcome } from "./request"
import { profiles, verifyToken } from "./supabase"
import { AuthHeaders } from "./types/collection"

export interface Caller {
	id: string
	token: string
	username: string
	avatar: string
	role: string
}

export function bearerToken(header: string | undefined | null) {
	return header?.match(/^Bearer (\S+)$/i)?.[1] ?? null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function claimedId(token: string) {
	try {
		const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString())
		const sub: unknown = payload?.sub
		return typeof sub === "string" && UUID.test(sub) ? sub : null
	} catch {
		return null
	}
}

const invalidSession = () => fail({ code: 401, error: "Your session is invalid or has expired." })

/** 401 is retryable after a refresh, 403 is not. */
export async function authenticate(header: string | undefined | null): Promise<Outcome<Caller>> {
	const token = bearerToken(header)
	if (!token) return fail({ code: 401, error: "Missing access token." })

	const claimed = claimedId(token)
	if (!claimed) return invalidSession()

	const [id, { data, error }] = await Promise.all([
		verifyToken(token),
		profiles
			.from("profiles")
			.select("username, avatar, role, banned_at")
			.eq("id", claimed)
			.maybeSingle()
	])
	if (id !== claimed) return invalidSession()
	if (error) return serverError("Failed to load your account.", error)
	if (!data) return fail({ code: 403, error: "This account no longer exists." })
	if (data.banned_at) return fail({ code: 403, error: "This account is banned." })

	return ok({ id, token, username: data.username, avatar: data.avatar, role: data.role })
}

/** `auth: true` on a route requires the bearer header and hands the handler the `caller`. */
export const auth = new Elysia({ name: "auth" }).macro({
	auth: {
		headers: AuthHeaders,
		detail: { security: [{ bearerAuth: [] }] },
		async resolve({ headers }) {
			const result = await authenticate(headers.authorization)
			return result.failure ? reply(result) : { caller: result.data }
		}
	}
})
