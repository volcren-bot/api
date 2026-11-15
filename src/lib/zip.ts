import { inflateRawSync } from "node:zlib"

export interface ZipEntry {
	name: string
	bytes: Uint8Array
}

const END_OF_DIRECTORY = 0x06054b50
const DIRECTORY_ENTRY = 0x02014b50
const LOCAL_HEADER = 0x04034b50
const STORED = 0
const DEFLATED = 8

function findEndOfDirectory(view: DataView) {
	for (let at = view.byteLength - 22; at >= Math.max(0, view.byteLength - 22 - 0xffff); at--) {
		if (view.getUint32(at, true) === END_OF_DIRECTORY) return at
	}
	throw new Error("not a zip archive")
}

export function unzip(archive: Uint8Array, maxBytes: number): ZipEntry[] {
	const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
	const end = findEndOfDirectory(view)
	const count = view.getUint16(end + 10, true)
	let at = view.getUint32(end + 16, true)
	const decoder = new TextDecoder()
	const entries: ZipEntry[] = []
	let total = 0

	for (let i = 0; i < count; i++) {
		if (view.getUint32(at, true) !== DIRECTORY_ENTRY) throw new Error("corrupt zip directory")
		const method = view.getUint16(at + 10, true)
		const packed = view.getUint32(at + 20, true)
		const size = view.getUint32(at + 24, true)
		const nameLength = view.getUint16(at + 28, true)
		const extraLength = view.getUint16(at + 30, true)
		const commentLength = view.getUint16(at + 32, true)
		const local = view.getUint32(at + 42, true)
		const name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength))
		at += 46 + nameLength + extraLength + commentLength

		if (name.endsWith("/")) continue
		if (name.startsWith("/") || name.split("/").includes(".."))
			throw new Error(`unsafe zip path ${name}`)
		if (view.getUint32(local, true) !== LOCAL_HEADER) throw new Error("corrupt zip entry")
		total += size
		if (total > maxBytes) throw new Error("zip archive is too large")

		const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
		const data = archive.subarray(start, start + packed)
		let bytes: Uint8Array
		if (method === STORED) bytes = data
		else if (method === DEFLATED) bytes = inflateRawSync(data, { maxOutputLength: size })
		else throw new Error(`unsupported zip compression ${method}`)
		if (bytes.byteLength !== size) throw new Error(`zip entry ${name} has the wrong size`)
		entries.push({ name, bytes })
	}
	return entries
}
