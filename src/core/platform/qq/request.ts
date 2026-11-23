import { md5, sha256Hex, randomInt } from '../crypto'

const SIGN_PREFIX = 'CJBPACrRuNy7'
const SIGN_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

export const createQQMusicRequestSign = (body: string): string => {
  let randomPart = ''
  const length = randomInt(7) + 10
  for (let index = 0; index < length; index++) {
    randomPart += SIGN_CHARS[randomInt(SIGN_CHARS.length)]
  }
  const hash = md5(`${SIGN_PREFIX}${body}`)
  return `zza${randomPart}${hash}`
}

export const createQQMusicFallbackGuid = (uin: string): string => {
  return md5(`lx-music-qq-guid:${uin}`)
}

export const createQQMusicFallbackUid = (uin: string): string => {
  const hash = sha256Hex(`lx-music-qq-uid:${uin}`)
  return String(Number.parseInt(hash.slice(0, 12), 16) % 10_000_000_000).padStart(10, '0')
}
