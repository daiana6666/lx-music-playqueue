declare module 'pako' {
  export function inflate(data: Buffer | Uint8Array, options: { to: 'string' }): string
  export function inflate(data: Buffer | Uint8Array, options?: { to?: undefined }): Uint8Array

  const pako: {
    inflate: typeof inflate
  }

  export default pako
}
