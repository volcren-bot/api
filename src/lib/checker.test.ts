import { beforeAll, describe, expect, test } from "bun:test"
import { deflateRawSync } from "node:zlib"
import { unzip } from "./zip"

let checker: typeof import("./checker")

beforeAll(async () => {
	process.env.SUPABASE_URL = "http://localhost:54321"
	process.env.SUPABASE_ANON_KEY = "anon"
	process.env.SUPABASE_SERVICE_KEY = "service"
	checker = await import("./checker")
})

function zip(files: { name: string; text: string; deflate: boolean }[]) {
	const parts: Buffer[] = []
	const directory: Buffer[] = []
	let offset = 0
	for (const file of files) {
		const plain = Buffer.from(file.text)
		const data = file.deflate ? deflateRawSync(plain) : plain
		const name = Buffer.from(file.name)
		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(file.deflate ? 8 : 0, 8)
		local.writeUInt32LE(data.length, 18)
		local.writeUInt32LE(plain.length, 22)
		local.writeUInt16LE(name.length, 26)
		const entry = Buffer.alloc(46)
		entry.writeUInt32LE(0x02014b50, 0)
		entry.writeUInt16LE(file.deflate ? 8 : 0, 10)
		entry.writeUInt32LE(data.length, 20)
		entry.writeUInt32LE(plain.length, 24)
		entry.writeUInt16LE(name.length, 28)
		entry.writeUInt32LE(offset, 42)
		parts.push(local, name, data)
		directory.push(entry, name)
		offset += local.length + name.length + data.length
	}
	const dir = Buffer.concat(directory)
	const end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50, 0)
	end.writeUInt16LE(files.length, 8)
	end.writeUInt16LE(files.length, 10)
	end.writeUInt32LE(dir.length, 12)
	end.writeUInt32LE(offset, 16)
	return new Uint8Array(Buffer.concat([...parts, dir, end]))
}

describe("unzip", () => {
	test("reads stored and deflated files", () => {
		const entries = unzip(
			zip([
				{ name: "host.luau", text: "--!strict\nreturn {}\n", deflate: false },
				{ name: "main/walker.luau", text: "x".repeat(5000), deflate: true }
			]),
			1 << 20
		)
		expect(entries.map((e) => e.name)).toEqual(["host.luau", "main/walker.luau"])
		expect(new TextDecoder().decode(entries[1].bytes)).toBe("x".repeat(5000))
	})

	test("refuses paths that climb out", () => {
		expect(() =>
			unzip(zip([{ name: "../evil.luau", text: "", deflate: false }]), 1 << 20)
		).toThrow()
	})

	test("refuses archives that unpack past the limit", () => {
		expect(() =>
			unzip(zip([{ name: "big.luau", text: "x".repeat(100), deflate: true }]), 50)
		).toThrow()
	})
})

describe("parseRelease", () => {
	const release = {
		version: "2026.11.22-94c0030",
		build: 1795000000,
		api_version: 3,
		files: {},
		sdk: {
			name: "sdk-2026.11.22-94c0030.zip",
			path: "2026.11.22-94c0030/sdk-2026.11.22-94c0030.zip",
			sha256: "ab".repeat(32)
		}
	}

	test("takes the release and its SDK from latest.json", () => {
		expect(checker.parseRelease(release)).toEqual({
			version: release.version,
			build: release.build,
			sdk: release.sdk
		})
	})

	test("refuses a release it can't use safely", () => {
		expect(() => checker.parseRelease(null)).toThrow()
		expect(() => checker.parseRelease({ ...release, sdk: undefined })).toThrow()
		expect(() =>
			checker.parseRelease({ ...release, sdk: { ...release.sdk, path: "../secret.zip" } })
		).toThrow()
		expect(() =>
			checker.parseRelease({ ...release, sdk: { ...release.sdk, sha256: "ab" } })
		).toThrow()
		expect(() => checker.parseRelease({ ...release, version: "a,checked_injector.eq.b" })).toThrow()
		expect(() => checker.parseRelease({ ...release, build: 0 })).toThrow()
	})
})

describe("decryptFile", () => {
	test("opens a file sealed the way the webapp uploads it", async () => {
		const key = crypto.getRandomValues(new Uint8Array(32))
		const hex = Array.from(key, (b) => b.toString(16).padStart(2, "0")).join("")
		const aes = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"])
		const nonce = crypto.getRandomValues(new Uint8Array(12))
		const sealed = await crypto.subtle.encrypt(
			{
				name: "AES-GCM",
				iv: nonce,
				additionalData: new TextEncoder().encode("volcren:s1/000000003/main.luau")
			},
			aes,
			new TextEncoder().encode("--!strict\nprint(1)\n")
		)
		const file = new Uint8Array([...nonce, ...new Uint8Array(sealed)])
		expect(await checker.decryptFile(file, hex, "s1", 3, "main.luau")).toBe("--!strict\nprint(1)\n")
		expect(checker.decryptFile(file, hex, "s1", 3, "other.luau")).rejects.toThrow()
	})
})

describe("parseDiagnostics", () => {
	const run = "/tmp/run"

	test("keeps type and syntax errors in the revision's files, with continuation lines", () => {
		const output = [
			"main.luau(717,17): TypeError: Key 'form' not found in table 'Host'",
			"lib/route.luau(3,1): SyntaxError: Expected identifier",
			"/tmp/run/lib/route.luau(9,2): TypeError: Expected this to be",
			"\t'{ x: number }'",
			"but got",
			"\t'{ y: number }'",
			"/opt/lib/main/walker.luau(1,1): TypeError: an error inside the lib",
			"main.luau(2,1): LintWarning: LocalUnused: Variable 'x' is never used"
		].join("\n")
		expect(checker.parseDiagnostics(output, run, ["main.luau", "lib/route.luau"])).toEqual([
			{ file: "main.luau", line: 717, column: 17, message: "Key 'form' not found in table 'Host'" },
			{ file: "lib/route.luau", line: 3, column: 1, message: "Expected identifier" },
			{
				file: "lib/route.luau",
				line: 9,
				column: 2,
				message: "Expected this to be\n\t'{ x: number }'\nbut got\n\t'{ y: number }'"
			}
		])
	})

	test("reports a repeated error once", () => {
		const line = "main.luau(1,1): TypeError: Unknown global 'x'"
		expect(checker.parseDiagnostics(`${line}\n${line}`, run, ["main.luau"])).toHaveLength(1)
	})
})

describe("headerProblems", () => {
	test("every file has to be strict", () => {
		expect(
			checker
				.headerProblems([
					{ name: "main.luau", text: "--!strict\nreturn 1" },
					{ name: "loose.luau", text: "--!nonstrict\nreturn 1" },
					{ name: "bare.luau", text: "return 1" }
				])
				.map((p) => p.file)
		).toEqual(["loose.luau", "bare.luau"])
	})
})

describe("capProblems", () => {
	test("keeps what fits the database's limits", () => {
		const many = Array.from({ length: 500 }, (_, i) => ({
			file: "main.luau",
			line: i,
			column: 1,
			message: "m".repeat(900)
		}))
		const kept = checker.capProblems(many)
		expect(kept.length).toBeLessThanOrEqual(100)
		expect(JSON.stringify(kept).length).toBeLessThanOrEqual(60 * 1024)
		expect(kept[0]).toEqual(many[0])
	})
})
