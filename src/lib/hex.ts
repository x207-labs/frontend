export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
export const fromHex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g) ?? [], (h) => parseInt(h, 16))
