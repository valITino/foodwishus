// From a file the camera or the gallery hands over to a proof photo that can be saved:
// when it was taken, and the picture shrunk to what the app keeps. One place, so the
// proof section and the two ways that start with the photo read a file the same way.

import { prepareImage, type PreparedImage } from '../../data/photos'
import type { ISO, PhotoSource } from '../../data/types'
import { captureTime, readExifDate } from './logic'

/** A proof photo, ready for addProofPhoto. */
export interface Shot {
  image: PreparedImage
  source: PhotoSource
  takenAt: ISO
}

/** Read a picked file. Rejects when it is no picture this browser can read. */
export async function readShot(file: File, source: PhotoSource): Promise<Shot> {
  // A gallery photo knows when it was taken; a live one was taken now.
  const exif = source === 'gallery' ? readExifDate(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())) : null
  const takenAt = captureTime({ source, exif, lastModified: file.lastModified })
  const image = await prepareImage(file)
  return { image, source, takenAt }
}
