import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { bodyTooLarge, getClientIP, REPORT_BODY_BYTES } from "$lib/request"
import openapi from "@elysiajs/openapi"
import { autoload } from "elysia-autoload"

console.log(`volcren-api is starting...`)

const app = new Elysia()

app.onAfterResponse((response) => {
	const { request, path, set, server } = response
	if (/^\/docs(\/json)?\/?$/.test(path)) return

	const ip = getClientIP(request, server)
	const userAgent = request.headers.get("user-agent")
	const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "")

	console.log(`[${timestamp}]: [${set.status}] ${userAgent} ${ip} - ${request.method} ${path}`)
})

// Bug reports carry a script log, everything else stays small; Bun's limit is per server, so the rest is checked here.
app.onRequest(({ request, set }) => {
	if (bodyTooLarge(new URL(request.url).pathname, request.headers.get("content-length"))) {
		set.status = 413
		return { error: "Request body too large." }
	}
})

// Every error is JSON `{ error }` so the launcher can read it.
app.onError(({ code, error, set }) => {
	if (code === "VALIDATION") {
		set.status = 422
		const custom = error.customError
		return {
			error: typeof custom === "string" ? custom : (error.all[0]?.summary ?? "Invalid request.")
		}
	}
	if (code === "NOT_FOUND") {
		set.status = 404
		return { error: "Not found." }
	}
})

app.use(cors())

// The OpenAPI plugin has no favicon option, so the docs page links to the webapp's icon.
const FAVICON_URL = "https://volcren.com/favicon.svg"
const FAVICON_ICO_URL = "https://volcren.com/favicon.ico"

// Browsers request /favicon.ico on their own, so send them to the webapp's copy.
app.get("/favicon.ico", ({ redirect }) => redirect(FAVICON_ICO_URL, 301), {
	detail: { hide: true }
})

app.onAfterHandle(async ({ path, responseValue }) => {
	if (path !== "/docs" && path !== "/docs/") return
	if (!(responseValue instanceof Response)) return
	const html = await responseValue.text()
	return new Response(
		html.replace("<head>", `<head><link rel="icon" href="${FAVICON_URL}" type="image/svg+xml" />`),
		{
			status: responseValue.status,
			headers: responseValue.headers
		}
	)
})

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
				{ name: "Sessions", description: "Running scripts: start, heartbeat, end, stats" },
				{
					name: "Agent sessions",
					description: "Metering of free agent runs from the loader's MCP server"
				},
				{ name: "Feedback", description: "Internal script scores and bug reports" }
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

app.listen({
	hostname: process.env.HOST ?? "0.0.0.0",
	port: process.env.PORT ?? 3000,
	maxRequestBodySize: REPORT_BODY_BYTES
})

export type ElysiaApp = typeof app

console.log(`🔥 volcren-api is running at ${app.server!.url}`)
console.log(`📚 Documentation live at ${app.server!.url}docs`)
