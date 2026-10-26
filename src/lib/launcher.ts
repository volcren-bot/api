import { logError } from "./request"
import { createUserClient, payments, scripts, stats, supabaseAdmin } from "./supabase"
import { reportedMinutes, validateStats } from "./validation"
import type { CachedLimits, Limits, StatsPayload } from "./types/collection"
import type { Caller } from "./auth"

/** Bump when a launcher endpoint changes in a way old launchers can't handle. `GET /launcher/me` reports it. */
export const API_VERSION = 1
export const HEARTBEAT_SECONDS = 60
export const SIGNED_URL_SECONDS = 60
const LIMITS_CACHE_MS = 2 * 60 * 1000
const MAX_LISTED = 200
const ACCESS_CHECK_BATCH = 25

export interface Failure {
	code: 400 | 402 | 403 | 404 | 409 | 500 | 502
	error: string
	required?: number
}

export const maxOpenSessions = () => Number(process.env.MAX_OPEN_SESSIONS) || 5

const pad = (revision: number) => String(revision).padStart(9, "0")

/** The folder a revision's files live in, in the `scripts` bucket. */
export const revisionFolder = (scriptId: string, revision: number) => `${scriptId}/${pad(revision)}`

async function getConfig() {
	const { data, error } = await payments()
		.from("config")
		.select("min_balance_minutes, session_timeout_minutes")
		.single()
	if (error) return { config: null, error: logError("Failed to load the billing settings.", error) }
	return { config: data, error: null }
}

async function getCredits(userId: string) {
	const { data } = await payments()
		.from("accounts")
		.select("credits")
		.eq("user_id", userId)
		.maybeSingle()
	return data?.credits ?? 0
}

export async function getMe(caller: Caller) {
	const [{ config, error }, credits] = await Promise.all([getConfig(), getCredits(caller.id)])
	if (error != null || !config)
		return { me: null, failure: { code: 500, error: error ?? "" } satisfies Failure }
	return {
		me: {
			username: caller.username,
			avatar_url: caller.avatar || null,
			role: caller.role,
			credits,
			min_balance_minutes: config.min_balance_minutes,
			api_version: API_VERSION
		},
		failure: null
	}
}

function escapeLike(text: string) {
	return text.replace(/[\\%_]/g, "\\$&")
}

export async function listScripts(caller: Caller, q: string, category: string) {
	const user = createUserClient(caller.token)
	let query = user
		.schema("scripts")
		.from("scripts")
		.select(
			"id, url, title, description, published, metadata!inner(type, categories, stage, price), protected!inner(author, revision, updated_at)"
		)
		.eq("published", true)

	const text = q.trim().toLowerCase()
	if (text) {
		const pattern = `"%${escapeLike(text).replace(/["\\]/g, "\\$&")}%"`
		query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`)
	}
	if (category) query = query.contains("metadata.categories", [category])

	const { data, error } = await query.limit(MAX_LISTED)
	if (error)
		return {
			scripts: null,
			failure: {
				code: 500,
				error: logError("Failed to load the scripts.", error)
			} satisfies Failure
		}

	const ids = data.map((s) => s.id)
	if (ids.length === 0) return { scripts: [], failure: null }

	const [authors, online, access] = await Promise.all([
		scripts().rpc("get_authors", { script_ids: ids }),
		stats().rpc("online_per_script"),
		checkAccess(caller.id, ids)
	])
	const names = new Map((authors.data ?? []).map((a) => [a.script_id, a.username]))
	const users = new Map((online.data ?? []).map((o) => [o.script_id, Number(o.users)]))

	const one = <T>(value: T | T[] | null): T | null =>
		Array.isArray(value) ? (value[0] ?? null) : value
	const imgs = `${process.env.SUPABASE_URL}/storage/v1/object/public/imgs/scripts`

	const list = data
		.flatMap((s) => {
			const metadata = one(s.metadata)
			const info = one(s.protected)
			return metadata && info ? [{ s, metadata, info }] : []
		})
		.sort((a, b) => b.info.updated_at.localeCompare(a.info.updated_at))
		.map(({ s, metadata, info }) => ({
			id: s.id,
			url: s.url,
			title: s.title,
			description: s.description,
			categories: metadata.categories,
			stage: metadata.stage,
			type: metadata.type,
			price: metadata.price,
			revision: info.revision > 0 ? info.revision : null,
			cover_url: `${imgs}/${s.id}/cover.webp`,
			can_access: access.get(s.id) ?? false,
			author: names.get(s.id) ?? "unknown",
			online: users.get(s.id) ?? 0
		}))

	return { scripts: list, failure: null }
}

/** `scripts.can_access` knows the stage, role and balance rules, so ask it instead of copying them here. */
async function checkAccess(userId: string, ids: string[]) {
	const result = new Map<string, boolean>()
	for (let i = 0; i < ids.length; i += ACCESS_CHECK_BATCH) {
		await Promise.all(
			ids.slice(i, i + ACCESS_CHECK_BATCH).map(async (id) => {
				const { data } = await scripts().rpc("can_access", { accesser_id: userId, script_id: id })
				result.set(id, data === true)
			})
		)
	}
	return result
}

/** Maps what `payments.start_session` raises to an HTTP answer. */
export function mapStartError(error: { code?: string; message?: string }): Failure {
	if (error.code === "42501")
		return { code: 403, error: "You don't have access to this script, or your account is banned." }
	if (error.code === "23514")
		return { code: 402, error: "Not enough credits to start this script." }
	if (error.message?.includes("no live revision"))
		return { code: 409, error: "This script has no live revision yet." }
	return { code: 500, error: logError("Failed to start the session.", error) }
}

export async function startSession(caller: Caller, scriptId: string) {
	const { count, error: openErr } = await payments()
		.from("sessions")
		.select("id", { count: "exact", head: true })
		.eq("user_id", caller.id)
		.is("ended_at", null)
	if (openErr)
		return {
			session: null,
			failure: {
				code: 500,
				error: logError("Failed to check your open sessions.", openErr)
			} satisfies Failure
		}
	if ((count ?? 0) >= maxOpenSessions()) {
		return {
			session: null,
			failure: {
				code: 409,
				error: `You already have ${maxOpenSessions()} sessions running. Stop one first.`
			} satisfies Failure
		}
	}

	const { data, error } = await payments().rpc("start_session", {
		p_user: caller.id,
		p_script: scriptId
	})
	if (error) {
		const failure = mapStartError(error)
		if (failure.code === 402) failure.required = await requiredBalance(scriptId)
		return { session: null, failure }
	}
	const started = data[0]
	if (!started)
		return {
			session: null,
			failure: { code: 500, error: logError("start_session returned nothing.") } satisfies Failure
		}

	const folder = revisionFolder(scriptId, started.revision)
	const { data: signed, error: signErr } = await supabaseAdmin.storage
		.from("scripts")
		.createSignedUrls(
			started.files.map((name) => `${folder}/${name}`),
			SIGNED_URL_SECONDS
		)
	if (signErr || signed.some((entry) => entry.error || !entry.signedUrl)) {
		// Don't bill for a session the launcher can't use.
		await payments().rpc("end_session", { p_session: started.session_id, p_reason: "stopped" })
		return {
			session: null,
			failure: {
				code: 502,
				error: logError("Failed to prepare the script files.", signErr ?? signed)
			} satisfies Failure
		}
	}

	const { data: price } = await payments()
		.from("sessions")
		.select("price")
		.eq("id", started.session_id)
		.single()

	openedAt.set(started.session_id, Date.now())
	return {
		session: {
			session_id: started.session_id,
			revision: started.revision,
			price: price?.price ?? 0,
			files: started.files.map((name, i) => ({ name, url: signed[i].signedUrl })),
			heartbeat_seconds: HEARTBEAT_SECONDS
		},
		failure: null
	}
}

async function requiredBalance(scriptId: string) {
	const { data } = await scripts().from("metadata").select("price").eq("id", scriptId).single()
	if (!data || data.price <= 0) return undefined
	const { data: required } = await payments().rpc("required_balance", { p_price: data.price })
	return required ?? undefined
}

/** When each open session last reported, so a report can't claim more runtime than really passed. Per process, which is fine: a restart only makes the next report conservative. */
const openedAt = new Map<string, number>()

// Sessions the server ends (timeout, out of credits) never come back through here, so forget idle ones.
setInterval(
	() => {
		const cutoff = Date.now() - 10 * 60 * 1000
		for (const [id, at] of openedAt) if (at < cutoff) openedAt.delete(id)
	},
	5 * 60 * 1000
).unref()

export async function ownedSession(sessionId: string, userId: string) {
	const { data, error } = await payments()
		.from("sessions")
		.select("user_id, script_id, ended_at, end_reason, charged_until")
		.eq("id", sessionId)
		.maybeSingle()
	if (error)
		return {
			session: null,
			failure: {
				code: 500,
				error: logError("Failed to load the session.", error)
			} satisfies Failure
		}
	// A session of someone else looks the same as one that doesn't exist, so ids can't be probed.
	if (!data || data.user_id !== userId)
		return { session: null, failure: { code: 404, error: "Session not found." } satisfies Failure }
	return { session: data, failure: null }
}

export async function heartbeat(
	caller: Caller,
	sessionId: string,
	report: StatsPayload | undefined
) {
	const { session, failure } = await ownedSession(sessionId, caller.id)
	if (failure) return { result: null, failure }

	const { data: alive, error } = await payments().rpc("heartbeat_session", { p_session: sessionId })
	if (error)
		return {
			result: null,
			failure: {
				code: 500,
				error: logError("Failed to send the heartbeat.", error)
			} satisfies Failure
		}

	const { data: after } = await payments()
		.from("sessions")
		.select("end_reason, charged_until")
		.eq("id", sessionId)
		.single()
	const credits = await getCredits(caller.id)

	if (!alive) {
		openedAt.delete(sessionId)
		return {
			result: {
				alive: false,
				reason: after?.end_reason ?? session.end_reason,
				credits,
				charged_until: after?.charged_until ?? null
			},
			failure: null
		}
	}

	const reported = report
		? await reportStats(sessionId, caller.id, session.script_id, report)
		: undefined
	return {
		result: { alive: true, credits, charged_until: after?.charged_until ?? null, stats: reported },
		failure: null
	}
}

export async function endSession(caller: Caller, sessionId: string) {
	const { failure } = await ownedSession(sessionId, caller.id)
	if (failure) return { result: null, failure }

	const { data, error } = await payments().rpc("end_session", {
		p_session: sessionId,
		p_reason: "stopped"
	})
	if (error)
		return {
			result: null,
			failure: { code: 500, error: logError("Failed to end the session.", error) } satisfies Failure
		}

	openedAt.delete(sessionId)
	return { result: { charged: data ?? 0 }, failure: null }
}

const limitsCache = new Map<string, CachedLimits>()

async function getLimits(scriptId: string): Promise<Limits | null> {
	const cached = limitsCache.get(scriptId)
	if (cached && Date.now() - cached.timestamp < LIMITS_CACHE_MS) return cached.limit
	const { data, error } = await stats()
		.from("limits")
		.select("xp_min, xp_max, gp_min, gp_max")
		.eq("id", scriptId)
		.single()
	if (error) {
		logError("Failed to load the script limits.", error)
		return null
	}
	limitsCache.set(scriptId, { limit: data, timestamp: Date.now() })
	return data
}

export interface StatsOutcome {
	accepted: boolean
	reason?: string
}

/** A rejected report doesn't fail the heartbeat: the session must stay alive and billed correctly. */
async function reportStats(
	sessionId: string,
	userId: string,
	scriptId: string,
	report: StatsPayload
): Promise<StatsOutcome> {
	const now = Date.now()
	const since = openedAt.get(sessionId) ?? now - HEARTBEAT_SECONDS * 1000
	const minutes = reportedMinutes(report.minutes, now - since)
	openedAt.set(sessionId, now)

	const limits = await getLimits(scriptId)
	if (!limits) return { accepted: false, reason: "This script doesn't accept stats yet." }

	const invalid = validateStats(limits, report, minutes)
	if (invalid != null) return { accepted: false, reason: invalid }

	const runtime = Math.round(minutes * 60 * 1000)
	const [script, user] = await Promise.all([
		stats().rpc("increment_script_stats", {
			script_id: scriptId,
			add_experience: report.experience,
			add_gold: report.gold,
			add_runtime: runtime
		}),
		stats().rpc("increment_user_stats", {
			user_id: userId,
			add_experience: report.experience,
			add_gold: report.gold,
			add_runtime: runtime
		})
	])
	if (script.error || user.error) {
		return {
			accepted: false,
			reason: logError("Failed to update the stats.", script.error ?? user.error)
		}
	}
	return { accepted: true }
}

/** Test hook. */
export const _internal = { openedAt, limitsCache }
