import { createHash, randomUUID } from "node:crypto"
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { scripts, supabaseAdmin } from "./supabase"
import { unzip } from "./zip"

export const LUAU_VERSION = "0.742"
const LUAU_SHA256 = "152058b98c60ff1f5b5ec9bca0b8eb37793cae161dd3a05608cc3d8738ba1a4d"
const LUAU_URL = `https://github.com/luau-lang/luau/releases/download/${LUAU_VERSION}/luau-ubuntu.zip`

const CHECK_TIMEOUT_MS = 60_000
const MAX_OUTPUT_BYTES = 1024 * 1024
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
const MAX_PROBLEMS = 100
const MAX_MESSAGE_CHARS = 1000
const MAX_PROBLEMS_BYTES = 60 * 1024
const COUNTED_KINDS = new Set(["TypeError", "SyntaxError"])
const STRICT_HEADER = /^\s*--!strict\b/

export type Problem = {
	file: string
	line: number
	column: number
	message: string
}

export interface LibRelease {
	version: string
	requires_host: number
	path: string
	sha256: string
}

export interface CheckResult {
	lib: string
	host: number
	problems: Problem[]
}

export interface SourceFile {
	name: string
	text: string
}

const root = () => process.env.CHECKER_DIR ?? join(tmpdir(), "volcren-checker")

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

async function download(url: string) {
	const response = await fetch(url)
	if (!response.ok) throw new Error(`${url} answered ${response.status}`)
	return new Uint8Array(await response.arrayBuffer())
}

async function bucketFile(bucket: string, path: string) {
	const { data, error } = await supabaseAdmin.storage.from(bucket).download(path)
	if (error || !data) throw new Error(`couldn't download ${bucket}/${path}: ${error?.message}`)
	return new Uint8Array(await data.arrayBuffer())
}

async function writeTree(dir: string, files: { name: string; bytes: Uint8Array | string }[]) {
	for (const file of files) {
		const path = resolve(dir, file.name)
		if (relative(dir, path).startsWith("..")) throw new Error(`unsafe path ${file.name}`)
		await mkdir(dirname(path), { recursive: true })
		await writeFile(path, file.bytes)
	}
}

async function install(final: string, fill: (dir: string) => Promise<void>) {
	const staging = `${final}.${randomUUID()}`
	await rm(staging, { recursive: true, force: true })
	await mkdir(staging, { recursive: true })
	await fill(staging)
	await rm(final, { recursive: true, force: true })
	await rename(staging, final)
}

let analyzer: Promise<string> | null = null

function analyzerPath() {
	analyzer ??= (async () => {
		const dir = join(root(), `luau-${LUAU_VERSION}`)
		const bin = join(dir, "luau-analyze")
		if (await Bun.file(bin).exists()) return bin
		const archive = await download(LUAU_URL)
		if (sha256(archive) !== LUAU_SHA256)
			throw new Error("luau-ubuntu.zip doesn't match its pinned checksum")
		const entry = unzip(archive, MAX_ARCHIVE_BYTES).find((e) => e.name === "luau-analyze")
		if (!entry) throw new Error("luau-ubuntu.zip has no luau-analyze")
		await install(dir, async (staging) => {
			await writeFile(join(staging, "luau-analyze"), entry.bytes)
			await chmod(join(staging, "luau-analyze"), 0o755)
		})
		return bin
	})().catch((error) => {
		analyzer = null
		throw error
	})
	return analyzer
}

export function parseIndex(value: unknown): LibRelease {
	const versions = (value as { versions?: unknown })?.versions
	const newest = Array.isArray(versions) ? (versions[0] as Partial<LibRelease>) : null
	if (
		!newest ||
		typeof newest.version !== "string" ||
		!/^[0-9A-Za-z.-]{1,64}$/.test(newest.version) ||
		!Number.isInteger(newest.requires_host) ||
		typeof newest.path !== "string" ||
		newest.path.split("/").some((part) => part === "" || part === "..") ||
		typeof newest.sha256 !== "string"
	)
		throw new Error("the lib index has no usable newest release")
	return newest as LibRelease
}

export async function newestLib() {
	const bytes = await bucketFile("client", "lib/index.json")
	return parseIndex(JSON.parse(new TextDecoder().decode(bytes)))
}

const libs = new Map<string, Promise<string>>()

function libDir(release: LibRelease) {
	let dir = libs.get(release.version)
	if (!dir) {
		dir = (async () => {
			const final = join(root(), "lib", release.version)
			if (await Bun.file(join(final, ".luaurc")).exists()) return final
			const archive = await bucketFile("client", release.path)
			if (sha256(archive) !== release.sha256.toLowerCase())
				throw new Error(`lib ${release.version} doesn't match its checksum`)
			const entries = unzip(archive, MAX_ARCHIVE_BYTES)
			await install(final, async (staging) => {
				await writeTree(staging, entries)
				await writeFile(join(staging, ".luaurc"), JSON.stringify({ aliases: { lib: "./" } }))
			})
			return final
		})().catch((error) => {
			libs.delete(release.version)
			throw error
		})
		libs.set(release.version, dir)
	}
	return dir
}

const additionalData = (scriptId: string, revision: number, name: string) =>
	new TextEncoder().encode(`volcren:${scriptId}/${String(revision).padStart(9, "0")}/${name}`)

export async function decryptFile(
	sealed: Uint8Array,
	keyHex: string,
	scriptId: string,
	revision: number,
	name: string
) {
	const key = Uint8Array.from(keyHex.match(/../g) ?? [], (byte) => parseInt(byte, 16))
	const aes = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"])
	const plain = await crypto.subtle.decrypt(
		{
			name: "AES-GCM",
			iv: sealed.slice(0, 12),
			additionalData: additionalData(scriptId, revision, name)
		},
		aes,
		sealed.slice(12)
	)
	return new TextDecoder().decode(plain)
}

export async function revisionSources(scriptId: string, revision: number, files: string[]) {
	const { data: keyRow, error } = await scripts
		.from("version_keys")
		.select("key")
		.eq("id", scriptId)
		.eq("revision", revision)
		.maybeSingle()
	if (error) throw new Error(`couldn't read the revision key: ${error.message}`)
	const key = keyRow ? keyRow.key.replace(/^\\x/, "") : null
	const folder = `${scriptId}/${String(revision).padStart(9, "0")}`
	return Promise.all(
		files
			.filter((name) => name.endsWith(".luau"))
			.map(async (name) => {
				const bytes = await bucketFile("scripts", `${folder}/${name}`)
				const text = key
					? await decryptFile(bytes, key, scriptId, revision, name)
					: new TextDecoder().decode(bytes)
				return { name, text }
			})
	)
}

const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): (\w+): (.*)$/

export function parseDiagnostics(output: string, runDir: string, files: string[]): Problem[] {
	const known = new Set(files)
	const problems: (Problem & { counted: boolean })[] = []
	let current: (Problem & { counted: boolean }) | null = null
	for (const line of output.split("\n")) {
		const match = DIAGNOSTIC.exec(line)
		if (match) {
			const [, path, row, column, kind, message] = match
			const name = relative(runDir, resolve(runDir, path)).split("\\").join("/")
			current = known.has(name)
				? {
						file: name,
						line: Number(row),
						column: Number(column),
						message,
						counted: COUNTED_KINDS.has(kind)
					}
				: null
			if (current) problems.push(current)
		} else if (current && line.trim()) {
			current.message += `\n${line}`
		}
	}
	const seen = new Set<string>()
	return problems
		.filter((p) => p.counted)
		.map(({ file, line, column, message }) => ({
			file,
			line,
			column,
			message:
				message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS)}…` : message
		}))
		.filter((p) => {
			const key = `${p.file}:${p.line}:${p.column}:${p.message}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
}

export function headerProblems(sources: SourceFile[]): Problem[] {
	return sources
		.filter((source) => !STRICT_HEADER.test(source.text))
		.map((source) => ({
			file: source.name,
			line: 1,
			column: 1,
			message: "Every file starts with --!strict."
		}))
}

export function capProblems(problems: Problem[]): Problem[] {
	const kept: Problem[] = []
	let bytes = 2
	for (const problem of problems.slice(0, MAX_PROBLEMS)) {
		bytes += JSON.stringify(problem).length + 1
		if (bytes > MAX_PROBLEMS_BYTES) break
		kept.push(problem)
	}
	return kept
}

async function readCapped(stream: ReadableStream<Uint8Array>) {
	const chunks: Uint8Array[] = []
	let size = 0
	for await (const chunk of stream) {
		if (size >= MAX_OUTPUT_BYTES) continue
		chunks.push(chunk.subarray(0, MAX_OUTPUT_BYTES - size))
		size += chunk.byteLength
	}
	return new TextDecoder().decode(Buffer.concat(chunks))
}

async function analyze(lib: string, sources: SourceFile[]): Promise<Problem[]> {
	if (!sources.length)
		return [{ file: "", line: 1, column: 1, message: "The revision has no .luau file." }]
	const bin = await analyzerPath()
	await mkdir(join(root(), "runs"), { recursive: true })
	const runDir = await mkdtemp(join(root(), "runs", "check-"))
	try {
		await writeTree(
			runDir,
			sources.map((source) => ({ name: source.name, bytes: source.text }))
		)
		await writeFile(join(runDir, ".luaurc"), JSON.stringify({ aliases: { lib: `${lib}/` } }))
		const names = sources.map((source) => source.name)
		const child = Bun.spawn([bin, "--mode=strict", ...names], {
			cwd: runDir,
			stdout: "pipe",
			stderr: "pipe",
			timeout: CHECK_TIMEOUT_MS,
			killSignal: "SIGKILL"
		})
		const [stdout, stderr] = await Promise.all([readCapped(child.stdout), readCapped(child.stderr)])
		await child.exited
		if (child.signalCode)
			return [
				{
					file: names[0],
					line: 1,
					column: 1,
					message: "The type check took too long and was stopped."
				}
			]
		return [...headerProblems(sources), ...parseDiagnostics(`${stdout}\n${stderr}`, runDir, names)]
	} finally {
		await rm(runDir, { recursive: true, force: true })
	}
}

let queue: Promise<unknown> = Promise.resolve()

function serially<T>(task: () => Promise<T>): Promise<T> {
	const next = queue.then(task, task)
	queue = next.catch(() => undefined)
	return next
}

export function checkRevision(
	scriptId: string,
	revision: number,
	release?: LibRelease
): Promise<CheckResult> {
	return serially(async () => {
		const { data: version, error } = await scripts
			.from("versions")
			.select("files")
			.eq("id", scriptId)
			.eq("revision", revision)
			.single()
		if (error)
			throw new Error(`couldn't read revision ${revision} of ${scriptId}: ${error.message}`)
		const lib = release ?? (await newestLib())
		const [dir, sources] = await Promise.all([
			libDir(lib),
			revisionSources(scriptId, revision, version.files)
		])
		const problems = capProblems(await analyze(dir, sources))
		const { error: recordErr } = await scripts.rpc("record_check", {
			p_script: scriptId,
			p_revision: revision,
			p_lib: lib.version,
			p_host: lib.requires_host,
			p_problems: problems.length ? problems : null
		})
		if (recordErr) throw new Error(`couldn't record the check: ${recordErr.message}`)
		return { lib: lib.version, host: lib.requires_host, problems }
	})
}
