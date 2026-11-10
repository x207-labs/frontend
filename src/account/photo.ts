// FE-087: the profile photo. The account service has no field for a picture, so the photo stays in this browser, next to the cached name
// (see cache.ts). The picked image is cut to a centred square and drawn at 192 px, so a phone photo of several megabytes becomes a few kilobytes.
// FE-096: the file is decoded with createImageBitmap, which the page's Content-Security-Policy does not govern. A blob: URL in an <img> is blocked
// by the production policy (img-src has no blob:), so every photo failed there while it worked on localhost. The fallback reads the file as a
// data: URL, which img-src allows.

const SIZE = 192
const MAX_BYTES = 15 * 1024 * 1024

export class PhotoError extends Error {}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void }

const isHeic = (file: File) => /image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name)

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('no data')))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = src
  })
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // some browsers cannot decode every format through createImageBitmap; try the <img> path
    }
  }
  try {
    const img = await loadImage(await readAsDataUrl(file))
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } catch {
    throw new PhotoError(
      isHeic(file)
        ? 'This browser cannot open HEIC photos. Save the photo as JPG or PNG and pick it again.'
        : 'This photo could not be opened. It may be damaged or in a format this browser does not read. Try another JPG, PNG or WebP.',
    )
  }
}

/** A square JPEG data URL of the centre of the image, or a PhotoError with a sentence for the person. */
export async function photoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/') && !isHeic(file)) throw new PhotoError('That file is not a picture. Choose a JPG, PNG or WebP.')
  if (file.size > MAX_BYTES) throw new PhotoError('That photo is over 15 MB. Choose a smaller one.')
  const image = await decode(file)
  try {
    const side = Math.min(image.width, image.height)
    if (!side) throw new PhotoError('That photo is empty. Choose another one.')
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new PhotoError('This browser cannot resize photos here. Try another browser.')
    ctx.drawImage(image.source, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    image.close()
  }
}
