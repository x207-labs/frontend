// FE-087: the profile photo. The account service has no field for a picture, so the photo stays in this browser, next to the cached name
// (see cache.ts). The picked image is cut to a centred square and drawn at 192 px, so a phone photo of several megabytes becomes a few kilobytes.

const SIZE = 192
const MAX_BYTES = 15 * 1024 * 1024

export class PhotoError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new PhotoError('That file could not be read as an image. Try a JPG, PNG or WebP.'))
    }
    img.src = url
  })
}

/** A square JPEG data URL of the centre of the image, or a PhotoError with a sentence for the person. */
export async function photoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new PhotoError('Choose an image: a JPG, PNG or WebP.')
  if (file.size > MAX_BYTES) throw new PhotoError('That image is over 15 MB. Choose a smaller one.')
  const img = await loadImage(file)
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  if (!side) throw new PhotoError('That image is empty. Choose another one.')
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PhotoError('This browser cannot resize images here.')
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE)
  return canvas.toDataURL('image/jpeg', 0.86)
}
