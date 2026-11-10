import { t, type Static } from "elysia"
import { Constants } from "./supabase"

export const UuidParams = t.Object({
	id: t.String({ format: "uuid", error: "ID must be a valid UUID." })
})

export const AuthHeaders = t.Object({
	authorization: t.String({
		description: "Supabase access token",
		examples: ["Bearer abcdef012345..."],
		error: "Authorization header is missing."
	})
})

export const ScriptsQuery = t.Object({
	q: t.Optional(t.String({ maxLength: 100, description: "Search the title and description" })),
	category: t.Optional(
		t.Union(
			Constants.scripts.Enums.category.map((category) => t.Literal(category)),
			{ description: "Only scripts in this category", error: "Unknown category." }
		)
	),
	community: t.Optional(
		t.BooleanString({
			description: "Tester+ only: list every community script the account can see"
		})
	)
})

export type ScriptsFilter = Static<typeof ScriptsQuery>

/** The documented answers of a signed-in endpoint: the ones every such endpoint gives, then its own. */
export const authResponses = (own: Record<number, { description: string }>) => ({
	401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
	403: { description: "The account is banned or deleted." },
	429: { description: "You are rate limited." },
	...own
})

export const StatsSchema = t.Object({
	experience: t.Number({ minimum: 0, description: "Experience gained since the last heartbeat" }),
	gold: t.Number({ description: "Gold gained since the last heartbeat, can be negative" }),
	minutes: t.Number({
		minimum: 0,
		maximum: 60,
		description: "Minutes of runtime the report covers, as measured by the launcher"
	}),
	custom: t.Optional(
		t.Array(t.Number(), {
			maxItems: 32,
			description: "Custom tracker deltas, in the order of the script's trackers"
		})
	)
})

export type StatsPayload = Static<typeof StatsSchema>

export const HeartbeatBody = t.Object({ stats: t.Optional(StatsSchema) })
export const RedeemBody = t.Object({
	code: t.String({
		minLength: 1,
		maxLength: 128,
		description: "The share code, 64 hex digits"
	})
})
export const StartBody = t.Object({
	script_id: t.String({ format: "uuid", error: "script_id must be a valid UUID." })
})

export const ScoreBody = t.Object({
	score: t.Integer({ minimum: 1, maximum: 10, description: "1 (worst) to 10 (best)" })
})

export const ReportBody = t.Object({
	description: t.String({
		maxLength: 2000,
		default: "",
		description: "What went wrong, optional, at most 2000 characters"
	}),
	log: t.Optional(
		t.String({ maxLength: 262144, description: "The script's log, at most 256 KiB; keep the tail" })
	),
	snapshot: t.Optional(
		t.Record(t.String(), t.Unknown(), {
			description: "Game state when the bug happened, at most 48 KiB as JSON"
		})
	),
	diagnostics: t.Optional(
		t.Record(t.String(), t.Unknown(), {
			description:
				"Loader, lib, agent and client versions, and optionally OS and hardware, at most 12 KiB as JSON"
		})
	)
})

export type ReportPayload = Static<typeof ReportBody>
