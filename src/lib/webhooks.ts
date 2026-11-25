import { createHmac } from "node:crypto"
import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import { logError } from "./request"
import { webhooks } from "./supabase"
import type { Database, Json } from "./types/supabase"

type Fn = Database["webhooks"]["Functions"]
export type Delivery = Fn["claim_deliveries"]["Returns"][number]
type Event = Database["webhooks"]["Enums"]["event"]
type Format = Database["webhooks"]["Enums"]["format"]

const POLL_EVERY_MS = 15_000
const BATCH = 20
const TIMEOUT_MS = 10_000
const USER_AGENT = "VOLCREN-Webhooks/1"

const RESERVED_HEADERS = new Set([
	"host",
	"content-length",
	"content-type",
	"content-encoding",
	"transfer-encoding",
	"connection",
	"keep-alive",
	"upgrade",
	"te",
	"trailer",
	"expect",
	"cookie",
	"authorization",
	"user-agent",
	"forwarded",
	"via",
	"origin",
	"referer",
	"accept-encoding",
	"date",
	"x-real-ip"
])

const blocked = new BlockList()
for (const [network, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4]
] as const)
	blocked.addSubnet(network, prefix, "ipv4")
for (const [network, prefix] of [
	["::", 128],
	["::1", 128],
	["64:ff9b::", 96],
	["64:ff9b:1::", 48],
	["100::", 64],
	["2001::", 23],
	["2001:db8::", 32],
	["2002::", 16],
	["fc00::", 7],
	["fe80::", 10],
	["fec0::", 10],
	["ff00::", 8]
] as const)
	blocked.addSubnet(network, prefix, "ipv6")

export function isPublicAddress(address: string) {
	const family = isIP(address)
	if (family === 4) return !blocked.check(address, "ipv4")
	if (family === 6) return !blocked.check(address, "ipv6")
	return false
}

export function validHeader(name: string, value: string) {
	const lower = name.toLowerCase()
	return (
		/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(name) &&
		!RESERVED_HEADERS.has(lower) &&
		!/^(proxy-|sec-|x-forwarded-|x-volcren-)/.test(lower) &&
		value.length >= 1 &&
		value.length <= 1024 &&
		/^[\x20-\x7e]+$/.test(value)
	)
}

class DeliveryError extends Error {
	constructor(
		message: string,
		readonly retry: boolean
	) {
		super(message)
	}
}

const latestUrl = () => `${process.env.SUPABASE_URL}/storage/v1/object/public/client/latest.json`

const field = (payload: Json, key: string) =>
	payload && typeof payload === "object" && !Array.isArray(payload) ? payload[key] : undefined

export function eventData(event: Event, payload: Json): Json {
	if (event === "client_release") return { ...(payload as object), latest_url: latestUrl() }
	return payload
}

export function summary(event: Event, payload: Json) {
	const get = (key: string) => String(field(payload, key) ?? "")
	if (event === "client_release") return `VOLCREN client ${get("version")} is out.`
	if (event === "script_check") {
		const script = `${get("title")} revision ${get("revision")}`
		const against = `the check against client ${get("checked_injector")}`
		if (field(payload, "passed") === true)
			return `${script} passed ${against} and runs on client ${get("injector")}.`
		const count = Number(field(payload, "problem_count") ?? 0)
		return `${script} failed ${against} with ${count} problem${count === 1 ? "" : "s"} and keeps running on client ${get("injector")}.`
	}
	return "Test notification from VOLCREN."
}

export function renderBody(
	delivery: Pick<Delivery, "id" | "event" | "payload" | "created_at">,
	format: Format
) {
	const envelope = {
		id: delivery.id,
		event: delivery.event,
		created_at: delivery.created_at,
		data: eventData(delivery.event, delivery.payload)
	}
	if (format === "github_dispatch")
		return JSON.stringify({ event_type: `volcren.${delivery.event}`, client_payload: envelope })
	if (format === "text") return JSON.stringify({ text: summary(delivery.event, delivery.payload) })
	if (format === "discord")
		return JSON.stringify({
			content: summary(delivery.event, delivery.payload),
			allowed_mentions: { parse: [] }
		})
	return JSON.stringify(envelope)
}

export function signature(secret: string, timestamp: number, body: string) {
	return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

export function retryable(status: number) {
	return status === 408 || status === 425 || status === 429 || status >= 500
}

async function resolvePublic(hostname: string) {
	if (isIP(hostname))
		throw new DeliveryError("The webhook must name a host, not an address.", false)
	let addresses: { address: string }[]
	try {
		addresses = await lookup(hostname, { all: true, verbatim: true })
	} catch {
		throw new DeliveryError(`Couldn't resolve ${hostname}.`, true)
	}
	if (!addresses.length) throw new DeliveryError(`Couldn't resolve ${hostname}.`, true)
	if (!addresses.every(({ address }) => isPublicAddress(address)))
		throw new DeliveryError(`${hostname} resolves to a private address.`, false)
	return addresses[0].address
}

export function buildHeaders(delivery: Delivery, body: string, timestamp: number, host: string) {
	const headers: Record<string, string> = {}
	const names = delivery.header_names ?? []
	const values = delivery.header_values ?? []
	names.forEach((name, index) => {
		const value = values[index] ?? ""
		if (!validHeader(name, value))
			throw new DeliveryError(`The header ${name} isn't allowed.`, false)
		headers[name] = value
	})
	const bearer: string | null = delivery.bearer_token
	if (bearer) headers.Authorization = `Bearer ${bearer}`
	return {
		...headers,
		Host: host,
		"Content-Type": "application/json",
		"User-Agent": USER_AGENT,
		"X-Volcren-Event": delivery.event,
		"X-Volcren-Delivery": delivery.id,
		"X-Volcren-Timestamp": String(timestamp),
		"X-Volcren-Signature": signature(delivery.signing_secret, timestamp, body)
	}
}

export async function send(delivery: Delivery) {
	let url: URL
	try {
		url = new URL(delivery.url)
	} catch {
		throw new DeliveryError("The webhook URL is invalid.", false)
	}
	if (url.protocol !== "https:" || url.username || url.password)
		throw new DeliveryError("The webhook URL must be https without credentials.", false)
	const address = await resolvePublic(url.hostname)
	const body = renderBody(delivery, delivery.format)
	const timestamp = Math.floor(Date.now() / 1000)
	const target = `https://${isIP(address) === 6 ? `[${address}]` : address}${url.port ? `:${url.port}` : ""}${url.pathname}${url.search}`
	let response: Response
	try {
		response = await fetch(target, {
			method: "POST",
			headers: buildHeaders(delivery, body, timestamp, url.host),
			body,
			redirect: "manual",
			signal: AbortSignal.timeout(TIMEOUT_MS),
			tls: { serverName: url.hostname }
		})
	} catch (error) {
		const timedOut = error instanceof DOMException && error.name === "TimeoutError"
		throw new DeliveryError(
			timedOut ? "The endpoint didn't answer within 10 s." : "Couldn't connect to the endpoint.",
			true
		)
	}
	await response.body?.cancel().catch(() => {})
	return response.status
}

async function deliver(delivery: Delivery) {
	let status: number | null = null
	let error: string | null = null
	let retry = false
	try {
		status = await send(delivery)
		if (status >= 300 && status < 400)
			error = `The endpoint redirected (${status}); redirects aren't followed.`
		else if (status < 200 || status >= 300) retry = retryable(status)
	} catch (e) {
		if (e instanceof DeliveryError) {
			error = e.message
			retry = e.retry
		} else {
			logError(`Couldn't send webhook delivery ${delivery.id}.`, e)
			error = "The delivery failed on our side."
			retry = true
		}
	}
	const { error: finishError } = await webhooks.rpc("finish_delivery", {
		p_id: delivery.id,
		p_status: status as number,
		p_error: error as string,
		p_retry: retry
	})
	if (finishError) logError(`Couldn't record webhook delivery ${delivery.id}.`, finishError)
}

let running = false

export async function deliverDue() {
	if (running) return
	running = true
	try {
		for (;;) {
			const { data, error } = await webhooks.rpc("claim_deliveries", { p_limit: BATCH })
			if (error) throw error
			await Promise.all(data.map(deliver))
			if (data.length < BATCH) break
		}
	} catch (e) {
		logError("The webhook delivery run failed.", e)
	} finally {
		running = false
	}
}

export function startDeliveries() {
	void deliverDue()
	setInterval(() => void deliverDue(), POLL_EVERY_MS)
}
