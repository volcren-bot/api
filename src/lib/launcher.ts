import { logError } from "./request"
import { createUserClient, payments, scripts, stats, supabaseAdmin } from "./supabase"
import { reportedMinutes, roleAtLeast } from "./validation"
import type { StatsPayload } from "./types/collection"
import type { Caller } from "./auth"

/** Bump when a launcher endpoint changes in a way old launchers can't handle. `GET /launcher/me` reports it. */
export const API_VERSION = 2
export const HEARTBEAT_SECONDS = 60
export const SIGNED_URL_SECONDS = 60
const MAX_LISTED = 200
const ACCESS_CHECK_BATCH = 25

export interface Failure {
	code: 400 | 402 | 403 | 404 | 409 | 410 | 429 | 500 | 502
	reason?: string
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

const LIST_COLUMNS =
	"id, url, title, description, published, metadata!inner(type, categories, stage, price), protected!inner(author, revision, updated_at)"

/** Lists official and community scripts the account sees; `community` (tester+) lists only community ones. */
export async function listScripts(caller: Caller, q: string, category: string, community = false) {
	if (community && !roleAtLeast(caller.role, "tester"))
		return {
			scripts: null,
			failure: {
				code: 403,
				error: "Only testers can browse community scripts."
			} satisfies Failure
		}

	const user = createUserClient(caller.token)
	const text = q.trim().toLowerCase()
	const pattern = text ? `"%${escapeLike(text).replace(/["\\]/g, "\\$&")}%"` : null

	const base = () => {
		let query = user.schema("scripts").from("scripts").select(LIST_COLUMNS)
		if (pattern) query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`)
		if (category) query = query.contains("metadata.categories", [category])
		return query.limit(MAX_LISTED)
	}

	const queries = community
		? [base().eq("is_community", true)]
		: [
				base().eq("is_community", false).eq("published", true),
				base().eq("is_granted", true),
				base().eq("is_community", true).eq("protected.author", caller.id)
			]
	const results = await Promise.all(queries)
	const failed = results.find((r) => r.error)
	if (failed?.error)
		return {
			scripts: null,
			failure: {
				code: 500,
				error: logError("Failed to load the scripts.", failed.error)
			} satisfies Failure
		}

	const found = new Map<
		string,
		(typeof results)[number]["data"] extends (infer T)[] | null ? T : never
	>()
	for (const r of results) for (const s of r.data ?? []) found.set(s.id, s)
	const data = [...found.values()]

	const ids = data.map((s) => s.id)
	if (ids.length === 0) return { scripts: [], failure: null }

	const [authors, online, access, flags] = await Promise.all([
		scripts().rpc("get_authors", { script_ids: ids }),
		stats().rpc("online_per_script"),
		checkAccess(caller.id, ids),
		scriptFlags(user, ids)
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
		.slice(0, MAX_LISTED)
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
			community: flags.get(s.id)?.community ?? false,
			granted: flags.get(s.id)?.granted ?? false,
			author: names.get(s.id) ?? "unknown",
			online: users.get(s.id) ?? 0
		}))

	return { scripts: list, failure: null }
}

/** `is_community` and `is_granted` are computed columns, so fetch them for the ids found. */
async function scriptFlags(user: ReturnType<typeof createUserClient>, ids: string[]) {
	const { data } = await user
		.schema("scripts")
		.from("scripts")
		.select("id, is_community, is_granted")
		.in("id", ids)
	return new Map(
		(data ?? []).map((r) => [r.id, { community: r.is_community, granted: r.is_granted }])
	)
}

/** Asks `scripts.can_access` instead of duplicating its stage, role and balance rules. */
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
		return {
			code: 403,
			error: "You don't have access to this script, it's unavailable, or your account is banned."
		}
	if (error.code === "23514")
		return { code: 402, error: "Not enough credits to start this script." }
	if (error.message?.includes("no live revision"))
		return { code: 409, error: "This script has no live revision yet." }
	return { code: 500, error: logError("Failed to start the session.", error) }
}

/** Maps the database's redemption status to an HTTP failure; `ok` is not one. */
const REDEEM_FAILURES: Record<string, Failure> = {
	invalid: { code: 404, error: "This share code is not valid.", reason: "invalid" },
	expired: { code: 410, error: "This share code has expired.", reason: "expired" },
	used: { code: 409, error: "This share code has already been used.", reason: "used" },
	own: { code: 409, error: "You can't redeem your own share code.", reason: "own" },
	already_access: {
		code: 409,
		error: "You already have access to this script.",
		reason: "already_access"
	},
	rate_limited: {
		code: 429,
		error: "Too many failed attempts. Try again later.",
		reason: "rate_limited"
	}
}

export const redeemFailure = (status: string): Failure | null =>
	status === "ok" ? null : (REDEEM_FAILURES[status] ?? REDEEM_FAILURES.invalid)

/** Redeems a share code as the caller, marking it used and adding the grant in one step. */
export async function redeemCode(caller: Caller, code: string) {
	const { data, error } = await createUserClient(caller.token)
		.schema("scripts")
		.rpc("redeem_share_code", { p_code: code })
	if (error)
		return {
			redeemed: null,
			failure:
				error.code === "42501"
					? ({ code: 403, error: "This account can't redeem codes." } satisfies Failure)
					: ({ code: 500, error: logError("Failed to redeem the code.", error) } satisfies Failure)
		}
	const result = data[0]
	const failure = redeemFailure(result?.status ?? "invalid")
	if (failure || !result?.script_id)
		return { redeemed: null, failure: failure ?? REDEEM_FAILURES.invalid }
	return { redeemed: { script_id: result.script_id, url: result.url }, failure: null }
}

/** Removes a granted script from the caller's account. */
export async function removeGrant(caller: Caller, scriptId: string) {
	const { data, error } = await createUserClient(caller.token)
		.schema("scripts")
		.from("grants")
		.delete()
		.eq("script_id", scriptId)
		.eq("user_id", caller.id)
		.select("script_id")
	if (error)
		return {
			failure: {
				code: 500,
				error: logError("Failed to remove the script.", error)
			} satisfies Failure
		}
	if (data.length === 0)
		return {
			failure: { code: 404, error: "This script isn't granted to your account." } satisfies Failure
		}
	return { failure: null }
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
		let failure = mapStartError(error)
		// `can_access` refuses on a short balance too, which arrives as a 403.
		if (failure.code === 403 && (await lacksCredits(caller.id, scriptId)))
			failure = mapStartError({ code: "23514" })
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

	// Older revisions are plain and have no key.
	const { data: keyRow, error: keyErr } = await scripts()
		.from("version_keys")
		.select("key")
		.eq("id", scriptId)
		.eq("revision", started.revision)
		.maybeSingle()
	if (keyErr) {
		await payments().rpc("end_session", { p_session: started.session_id, p_reason: "stopped" })
		return {
			session: null,
			failure: {
				code: 502,
				error: logError("Failed to prepare the script files.", keyErr)
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
			entry: started.entry,
			files: started.files.map((name, i) => ({ name, url: signed[i].signedUrl })),
			key: keyRow ? hexKey(keyRow.key) : null,
			heartbeat_seconds: HEARTBEAT_SECONDS
		},
		failure: null
	}
}

/** Strips PostgREST's `\x` bytea prefix. */
export const hexKey = (bytea: string) => bytea.replace(/^\\x/, "")

/** Whether only the balance keeps the user from a script they can see. */
async function lacksCredits(userId: string, scriptId: string) {
	// A runnable script is never refused for credits.
	const { data: runnable } = await scripts().rpc("can_access", {
		accesser_id: userId,
		script_id: scriptId
	})
	if (runnable === true) return false
	const { data: visible } = await scripts().rpc("can_view", {
		viewer_id: userId,
		script_id: scriptId
	})
	if (visible !== true) return false
	const required = await requiredBalance(scriptId)
	return required !== undefined && (await getCredits(userId)) < required
}

async function requiredBalance(scriptId: string) {
	const { data } = await scripts().from("metadata").select("price").eq("id", scriptId).single()
	if (!data || data.price <= 0) return undefined
	const { data: required } = await payments().rpc("required_balance", { p_price: data.price })
	return required ?? undefined
}

/** When each open session last reported, to cap the runtime a report can claim. */
const openedAt = new Map<string, number>()

// Server-ended sessions never come back here, so drop idle ones.
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
	// Someone else's session looks like a missing one, so ids can't be probed.
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

	const reported = report ? await reportStats(sessionId, report) : undefined
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

export interface StatsOutcome {
	accepted: boolean
	reason?: string
}

/** A rejected report doesn't fail the heartbeat. */
async function reportStats(sessionId: string, report: StatsPayload): Promise<StatsOutcome> {
	const now = Date.now()
	const since = openedAt.get(sessionId) ?? now - HEARTBEAT_SECONDS * 1000
	const minutes = reportedMinutes(report.minutes, now - since)
	openedAt.set(sessionId, now)

	// The database validates against the script's limits and stores it in one transaction.
	const { error } = await stats().rpc("report_session", {
		p_session: sessionId,
		p_experience: Math.round(report.experience),
		p_gold: Math.round(report.gold),
		p_minutes: minutes,
		p_custom: (report.custom ?? []).map(Math.round)
	})
	if (error) {
		// Only the database's refusal messages are meant for the loader.
		if (error.code === "23514" || error.code === "22023")
			return { accepted: false, reason: error.message }
		return { accepted: false, reason: logError("Failed to update the stats.", error) }
	}
	return { accepted: true }
}

/** Test hook. */
export const _internal = { openedAt }
