import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { serverTiming } from "@elysiajs/server-timing"
import { getClientIP } from "$lib/request"
import openapi from "@elysiajs/openapi"
import { autoload } from "elysia-autoload"
export { t } from "elysia"
export { rateLimit } from "elysia-rate-limit"

console.log(`🔥 volcren-api is starting...`)

const app = new Elysia()

app.onAfterResponse((response) => {
	const { request, path, set, server } = response
	if (path === "/docs" || path === "/docs/" || path === "/docs/json" || path === "/docs/json/")
		return

	const ip = getClientIP(request, server)
	const userAgent = request.headers.get("user-agent")
	const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "")

	console.log(`[${timestamp}]: [${set.status}] ${userAgent} ${ip} - ${request.method} ${path}`)
})

// Every error is JSON: { error }, so the launcher can always read the message.
app.onError(({ code, error, set }) => {
	if (code === "VALIDATION") {
		set.status = 422
		return { error: error.message.split("\n")[0] }
	}
	if (code === "NOT_FOUND") {
		set.status = 404
		return { error: "Not found." }
	}
})

app.use(cors())

app.use(
	openapi({
		documentation: {
			info: {
				title: "Volcren API Documentation",
				version: "0.1.0",
				description: `The API the Volcren launcher talks to: sessions, billing heartbeats, script files and stats.

## Authentication
Every endpoint except \`/\` needs the access token of a Volcren (Supabase) session:
- \`Authorization: Bearer <access_token>\`

A \`401\` means the token is missing, invalid or expired: refresh it and retry once. A \`403\` means the account is banned or deleted.

## Rate limits
Rate limits apply per IP, and some per user or session (see each endpoint).
When you're rate limited, you get a \`429\` with a \`Retry-After\` header (seconds).

## Errors
Errors return JSON: \`{ "error": "message" }\`. Server errors include a \`(ref: xxxxxxxx)\` ID in the message.
Requests with missing or invalid headers, params or body return \`422\`.`
			},
			tags: [
				{ name: "General", description: "Public API information" },
				{ name: "Account", description: "The signed in account" },
				{ name: "Scripts", description: "The script store" },
				{ name: "Sessions", description: "Running scripts: start, heartbeat, end, stats" }
			],
			components: {
				securitySchemes: {
					bearerAuth: {
						type: "http",
						scheme: "bearer",
						description: "Supabase access token of a Volcren session."
					}
				}
			}
		},
		path: "/docs"
	})
)

app.use(
	await autoload({
		dir: "./routes",
		ignore: ["**/*.test.ts", "**/*.spec.ts"]
	})
)

app.use(serverTiming())

app.listen({
	hostname: process.env.HOST ?? "0.0.0.0",
	port: process.env.PORT ?? 3000,
	maxRequestBodySize: 64 * 1024
})

export type ElysiaApp = typeof app

console.log(`🦊 volcren-api is running at ${app.server!.url}`)
console.log(`📚 Documentation live at ${app.server!.url}docs`)
