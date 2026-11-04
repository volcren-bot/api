interface IPServer {
	requestIP(request: Request): { address: string } | null
}

// Behind a CDN or reverse proxy the client IP arrives in X-Real-IP.
export function getClientIP(request: Request, server: IPServer | null | undefined) {
	return request.headers.get("x-real-ip") ?? server?.requestIP(request)?.address ?? "unknown"
}

/** Request bodies are small, except a bug report, which carries a script log. */
export const MAX_BODY_BYTES = 64 * 1024
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
