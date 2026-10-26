import { rateLimit, type ElysiaApp } from "$src/index"
import { getClientIP } from "$lib/request"
import { authenticate } from "$lib/auth"
import { getMe } from "$lib/launcher"
import { AuthHeaders } from "$lib/types/collection"

export default (app: ElysiaApp) =>
	app
		.use(
			rateLimit({
				scoping: "scoped",
				duration: 60 * 1000,
				max: 60,
				errorResponse: "You've reached the 60 requests/min limit.",
				generator: (req, server) => getClientIP(req, server),
				injectServer: () => app.server
			})
		)
		.get(
			"",
			async ({ headers, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				const { me, failure } = await getMe(auth.caller)
				if (failure) return status(failure.code, { error: failure.error })
				return me
			},
			{
				headers: AuthHeaders,
				detail: {
					tags: ["Account"],
					summary: "Current account",
					security: [{ bearerAuth: [] }],
					description:
						"Username, avatar, role and credit balance of the signed in account, the minutes of balance a premium script needs to start, and the API version so old launchers can be told to update. Rate limit: 60 requests per minute per IP.",
					responses: {
						200: { description: "The account" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						403: { description: "The account is banned or deleted." },
						429: { description: "You are rate limited." }
					}
				}
			}
		)
