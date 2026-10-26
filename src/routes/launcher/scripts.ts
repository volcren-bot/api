import { rateLimit, t, type ElysiaApp } from "$src/index"
import { getClientIP } from "$lib/request"
import { authenticate } from "$lib/auth"
import { listScripts } from "$lib/launcher"
import { AuthHeaders } from "$lib/types/collection"

export default (app: ElysiaApp) =>
	app
		.use(
			rateLimit({
				scoping: "scoped",
				duration: 60 * 1000,
				max: 30,
				errorResponse: "You've reached the 30 requests/min limit.",
				generator: (req, server) => getClientIP(req, server),
				injectServer: () => app.server
			})
		)
		.get(
			"",
			async ({ headers, query, set, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				const { scripts, failure } = await listScripts(
					auth.caller,
					query.q ?? "",
					query.category ?? ""
				)
				if (failure) return status(failure.code, { error: failure.error })

				set.headers["cache-control"] = "private, max-age=30"
				return { scripts }
			},
			{
				headers: AuthHeaders,
				query: t.Object({
					q: t.Optional(
						t.String({ maxLength: 100, description: "Search the title and description" })
					),
					category: t.Optional(
						t.String({ maxLength: 30, description: "Only scripts in this category" })
					)
				}),
				detail: {
					tags: ["Scripts"],
					summary: "Scripts you can see",
					security: [{ bearerAuth: [] }],
					description:
						"Published scripts the account can see, with price in credits per minute, live revision, author, online users and whether the account can run it right now (`can_access`). Rate limit: 30 requests per minute per IP.",
					responses: {
						200: { description: "The scripts" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						403: { description: "The account is banned or deleted." },
						429: { description: "You are rate limited." }
					}
				}
			}
		)
