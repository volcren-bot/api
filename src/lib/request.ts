import { status } from "elysia"
import { rateLimit } from "elysia-rate-limit"
import type { ElysiaApp } from "$src/index"

interface IPServer {
	requestIP(request: Request): { address: string } | null
}

// Behind a CDN or reverse proxy the client IP arrives in X-Real-IP.
export function getClientIP(request: Request, server: IPServer | null | undefined) {
	return request.headers.get("x-real-ip") ?? server?.requestIP(request)?.address ?? "unknown"
}

/** A route group's limit of `max` requests a minute per IP. */
export const ipRateLimit = (app: ElysiaApp, max: number) =>
	rateLimit({
		scoping: "scoped",
		duration: 60 * 1000,
		max,
		errorResponse: `You've reached the ${max} requests/min limit.`,
		generator: getClientIP,
		injectServer: () => app.server
	})

/** Request bodies are small, except a bug report, which carries a script log. */
const MAX_BODY_BYTES = 64 * 1024
export const REPORT_BODY_BYTES = 512 * 1024

/** Whether a declared body length is over the limit for its path. A body without a length is left to the server's limit. */
export function bodyTooLarge(path: string, contentLength: string | null) {
	const length = Number(contentLength)
	if (!contentLength || !Number.isFinite(length)) return false
	return length > (path.endsWith("/report") ? REPORT_BODY_BYTES : MAX_BODY_BYTES)
}

export function logError(message: string, detail?: unknown) {
	const id = crypto.randomUUID().slice(0, 8)
	console.error(`[${id}] ${message}`, detail ?? "")
	return `${message} (ref: ${id})`
}

/** Why a request failed, as the launcher sees it: `{ error }`, plus `reason` or `required` where they apply. */
export interface Failure {
	code: 402 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 500 | 502
	reason?: string
	error: string
	required?: number
}

export type Outcome<T> = { data: T; failure: null } | { data: null; failure: Failure }

export const ok = <T>(data: T): Outcome<T> => ({ data, failure: null })
export const fail = (failure: Failure): Outcome<never> => ({ data: null, failure })
/** A 500 whose message carries the ref of the logged detail. */
export const internalError = (message: string, detail?: unknown): Failure => ({
	code: 500,
	error: logError(message, detail)
})
export const serverError = (message: string, detail?: unknown) =>
	fail(internalError(message, detail))

/** The route answer for an outcome: its data, or the failure's status and body. */
export function reply<R extends Outcome<unknown>>(outcome: R) {
	if (!outcome.failure) return outcome.data as Extract<R, { failure: null }>["data"]
	const { code, ...body } = outcome.failure
	return status(code, body)
}

/** Fixed-window counter per key. Returns false once a key goes over `max` hits within `duration` ms. */
export function createLimiter(max: number, duration: number) {
	const hits = new Map<string, { count: number; reset: number }>()

	setInterval(() => {
		const now = Date.now()
		for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key)
	}, duration).unref()

	return (key: string) => {
		const now = Date.now()
		const entry = hits.get(key)
		if (!entry || entry.reset <= now) {
			hits.set(key, { count: 1, reset: now + duration })
			return true
		}
		return ++entry.count <= max
	}
}
