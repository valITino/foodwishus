// Just enough zip for the backup file: write entries without compression, and read an
// archive by its table of contents. No library needed.
//
// Writing stores every entry as it is. The photos are JPEGs, which do not shrink, and
// the one text file is small next to them. Photos are handed over as blobs and are not
// copied, so a backup with hundreds of pictures never sits in memory as one piece.
//
// Reading jumps straight to the entry that is asked for, so looking at what a backup
// holds never reads the pictures. Archives that some other tool packed again (with
// compression) are read too, where the browser can inflate.
//
// Not supported, and refused with a clear error: archives over 4 GB or with more than
// 65,535 entries (zip64), and encrypted ones.

export type ZipProblem =
  /** No table of contents: not a zip, or cut off at the end. */
  | 'not_a_zip'
  /** A zip, but of a kind this reader cannot open. */
  | 'unsupported'
  /** An entry's bytes do not match what the archive says about them. */
  | 'damaged'

export class ZipError extends Error {
  readonly code: ZipProblem

  constructor(code: ZipProblem, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ZipError'
    this.code = code
  }
}

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const MAX_ENTRIES = 0xffff
const MAX_BYTES = 0xffffffff

let crcTable: Uint32Array | null = null

/** The checksum zip keeps for every entry. */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const encoder = new TextEncoder()

/** A date as zip stores it: two 16-bit numbers, in local time. */
function dosTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

interface Written {
  name: Uint8Array
  crc: number
  size: number
  offset: number
}

/** Builds a zip, entry by entry. Call add() for each file, then finish() once. */
export class ZipWriter {
  private parts: BlobPart[] = []
  private entries: Written[] = []
  private offset = 0
  private readonly stamp: { time: number; day: number }

  constructor(when: Date = new Date()) {
    this.stamp = dosTime(when)
  }

  private header(signature: number, entry: Written, extra: number): DataView {
    // Local header: 30 bytes. Central header: 46 bytes, the same fields after "version made by".
    const view = new DataView(new ArrayBuffer(extra))
    let at = 0
    view.setUint32(at, signature, true)
    at += 4
    if (signature === CENTRAL) {
      view.setUint16(at, 20, true) // made by: 2.0
      at += 2
    }
    view.setUint16(at, 20, true) // needs 2.0 to read
    view.setUint16(at + 2, 0x0800, true) // names are UTF-8
    view.setUint16(at + 4, 0, true) // stored, not compressed
    view.setUint16(at + 6, this.stamp.time, true)
    view.setUint16(at + 8, this.stamp.day, true)
    view.setUint32(at + 10, entry.crc, true)
    view.setUint32(at + 14, entry.size, true)
    view.setUint32(at + 18, entry.size, true)
    view.setUint16(at + 22, entry.name.length, true)
    // extra field length, and for the central header: comment length, disk, attributes
    if (signature === CENTRAL) view.setUint32(42, entry.offset, true)
    return view
  }

  /** Add one file. A blob is checked once and then kept by reference, not copied. */
  async add(name: string, data: Uint8Array | Blob): Promise<void> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer())
    const entry: Written = { name: encoder.encode(name), crc: crc32(bytes), size: bytes.length, offset: this.offset }
    if (this.entries.length >= MAX_ENTRIES || this.offset + 30 + entry.name.length + entry.size > MAX_BYTES) throw new ZipError('unsupported', 'too big for one zip')
    this.parts.push(this.header(LOCAL, entry, 30).buffer as ArrayBuffer, entry.name as BlobPart, data as BlobPart)
    this.offset += 30 + entry.name.length + entry.size
    this.entries.push(entry)
  }

  /** Close the archive and hand it over. */
  finish(): Blob {
    const start = this.offset
    let size = 0
    for (const entry of this.entries) {
      this.parts.push(this.header(CENTRAL, entry, 46).buffer as ArrayBuffer, entry.name as BlobPart)
      size += 46 + entry.name.length
    }
    if (start + size > MAX_BYTES) throw new ZipError('unsupported', 'too big for one zip')
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, END, true)
    end.setUint16(8, this.entries.length, true)
    end.setUint16(10, this.entries.length, true)
    end.setUint32(12, size, true)
    end.setUint32(16, start, true)
    this.parts.push(end.buffer as ArrayBuffer)
    return new Blob(this.parts, { type: 'application/zip' })
  }
}

export interface ZipEntry {
  name: string
  /** Bytes once unpacked. */
  size: number
  /** 0 stored, 8 deflated. */
  method: number
  crc: number
  packedSize: number
  /** Where the entry's own header starts in the file. */
  offset: number
}

const decoder = new TextDecoder()

async function slice(file: Blob, from: number, to: number): Promise<DataView> {
  if (from < 0 || to > file.size || from > to) throw new ZipError('damaged', 'cut off')
  return new DataView(await file.slice(from, to).arrayBuffer())
}

/** Read a zip's table of contents. Folders are left out. */
export async function listZip(file: Blob): Promise<ZipEntry[]> {
  // The table of contents is found through a small record at the very end of the file.
  const tailFrom = Math.max(0, file.size - (22 + 0xffff))
  const tail = await slice(file, tailFrom, file.size)
  let end = -1
  for (let at = tail.byteLength - 22; at >= 0; at--) {
    if (tail.getUint32(at, true) === END) {
      end = at
      break
    }
  }
  if (end < 0) throw new ZipError('not_a_zip')
  const count = tail.getUint16(end + 10, true)
  const size = tail.getUint32(end + 12, true)
  const start = tail.getUint32(end + 16, true)
  if (count === MAX_ENTRIES || size === MAX_BYTES || start === MAX_BYTES) throw new ZipError('unsupported', 'zip64')

  const table = await slice(file, start, start + size)
  const entries: ZipEntry[] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    if (at + 46 > table.byteLength || table.getUint32(at, true) !== CENTRAL) throw new ZipError('damaged', 'table of contents')
    const flags = table.getUint16(at + 8, true)
    const nameLength = table.getUint16(at + 28, true)
    const extraLength = table.getUint16(at + 30, true)
    const commentLength = table.getUint16(at + 32, true)
    if (at + 46 + nameLength > table.byteLength) throw new ZipError('damaged', 'table of contents')
    const name = decoder.decode(new Uint8Array(table.buffer, table.byteOffset + at + 46, nameLength))
    if (flags & 1) throw new ZipError('unsupported', 'encrypted')
    if (!name.endsWith('/')) {
      entries.push({
        name,
        method: table.getUint16(at + 10, true),
        crc: table.getUint32(at + 16, true),
        packedSize: table.getUint32(at + 20, true),
        size: table.getUint32(at + 24, true),
        offset: table.getUint32(at + 42, true),
      })
    }
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function inflate(packed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ZipError('unsupported', 'compressed')
  try {
    const stream = new Blob([packed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    throw new ZipError('damaged', 'cannot unpack')
  }
}

/** Read one entry's bytes and check them against the archive's checksum. */
export async function readZipEntry(file: Blob, entry: ZipEntry): Promise<Uint8Array> {
  const header = await slice(file, entry.offset, entry.offset + 30)
  if (header.getUint32(0, true) !== LOCAL) throw new ZipError('damaged', entry.name)
  const from = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
  const packed = await slice(file, from, from + entry.packedSize)
  let bytes = new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength)
  if (entry.method === 8) bytes = (await inflate(bytes)) as Uint8Array<ArrayBuffer>
  else if (entry.method !== 0) throw new ZipError('unsupported', `method ${entry.method}`)
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw new ZipError('damaged', entry.name)
  return bytes
}
