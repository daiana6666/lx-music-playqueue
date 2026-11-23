import { NativeModules } from 'react-native'
import { stringMd5 as nativeMd5 } from 'react-native-quick-md5'
import { sha256 } from '@noble/hashes/sha256'

export const md5 = (value: string): string => nativeMd5(value)
export const sha256Hex = (value: string): string => Buffer.from(sha256(Buffer.from(value, 'utf8'))).toString('hex')
export const randomHex = (length: number): string => NativeModules.PlatformCredentials.randomHex(length)
export const randomInt = (max: number): number => Number.parseInt(randomHex(4), 16) % max
export const randomId = (): string => {
  const bytes = randomHex(16)
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-${((Number.parseInt(bytes[16], 16) & 3) | 8).toString(16)}${bytes.slice(17, 20)}-${bytes.slice(20)}`
}
