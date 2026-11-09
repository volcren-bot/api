import type { ElysiaApp } from "$src/index"
import { ipRateLimit } from "$lib/request"
import { API_VERSION } from "$lib/launcher"

export default (app: ElysiaApp) =>
	app.use(ipRateLimit(app, 100)).get("/", () => ({ api_version: API_VERSION }), {
		detail: {
			tags: ["General"],
			summary: "API information",
			description:
				"Returns the launcher API version. Public. Rate limit: 100 requests per minute per IP.",
			responses: {
				200: {
					description: "API information",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: { api_version: { type: "integer" } },
								required: ["api_version"]
							}
						}
					}
				},
				429: { description: "You are rate limited." }
			}
		}
	})
