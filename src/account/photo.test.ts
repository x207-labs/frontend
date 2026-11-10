import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhotoError, photoFromFile } from './photo'

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type })

function stubCanvas() {
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA')
  return drawImage
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('FE-096 profile photo', () => {
  it('decodes with createImageBitmap (not a blob: URL, which the production CSP blocks) and draws the centred square', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 400, height: 300, close }))
    const createObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL }))
    const drawImage = stubCanvas()
    await expect(photoFromFile(file('me.jpg', 'image/jpeg'))).resolves.toBe('data:image/jpeg;base64,AAAA')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 50, 0, 300, 300, 0, 0, 192, 192)
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('a file that is not a picture, or is over 15 MB, gets a sentence that says so', async () => {
    await expect(photoFromFile(file('notes.txt', 'text/plain'))).rejects.toThrow('That file is not a picture. Choose a JPG, PNG or WebP.')
    await expect(photoFromFile(file('big.jpg', 'image/jpeg', 15 * 1024 * 1024 + 1))).rejects.toThrow('over 15 MB')
  })

  it('a photo no decoder can open: HEIC is named, any other format gets the general sentence', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('no')))
    vi.stubGlobal(
      'Image',
      class {
        onerror: (() => void) | null = null
        set src(_: string) {
          setTimeout(() => this.onerror?.())
        }
      },
    )
    const heic = photoFromFile(file('IMG_0001.HEIC', ''))
    await expect(heic).rejects.toBeInstanceOf(PhotoError)
    await expect(heic).rejects.toThrow('This browser cannot open HEIC photos.')
    await expect(photoFromFile(file('broken.jpg', 'image/jpeg'))).rejects.toThrow('This photo could not be opened.')
  })
})
