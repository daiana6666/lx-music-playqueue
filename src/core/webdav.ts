import { Buffer } from 'buffer'
import pako from 'pako'
import settingState from '@/store/setting/state'
import { decodeName } from '@/utils'
import { toMD5 } from '@/utils/tools'
import {
  buildUrl,
  isSameWebDAVRoot,
  isUrlWithinRoot,
  normalizeDirUrl,
  normalizeRelativeFilePath,
  parsePropfindResponse,
  parseUrl,
  type WebDAVEntry,
} from './webdav/helpers'

const AUDIO_EXTS = new Set(['mp3', 'flac', 'ogg', 'oga', 'wav', 'm4a'])
const LYRIC_EXTS = new Set(['lrc'])
const KRC_EXTS = new Set(['krc'])
const PIC_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp'])

interface WebDAVRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface WebDAVResource {
  url: string
  headers: Record<string, string>
}

const getConfiguredWebDAV = (): LX.Music.WebDAVConfig => ({
  url: settingState.setting['webdav.url'],
  username: settingState.setting['webdav.username'],
  password: settingState.setting['webdav.password'],
})

const assertConfig = (config: LX.Music.WebDAVConfig) => {
  if (!config.url || !config.username || !config.password) throw new Error('WebDAV config is incomplete')
  parseUrl(config.url)
}

export const getWebDAVAuthHeader = (config = getConfiguredWebDAV()) => {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`
}

const getFileName = (path: string) => {
  const name = path.split('/').filter(Boolean).at(-1) ?? path
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

const getExt = (fileName: string) => /\.([^.]+)$/.exec(fileName)?.[1]?.toLocaleLowerCase() ?? ''

const stripExt = (fileName: string) => fileName.replace(/\.[^.]*$/, '')

const getBasePath = (filePath: string) => {
  const index = filePath.lastIndexOf('.')
  return (index < 0 ? filePath : filePath.slice(0, index)).toLocaleLowerCase()
}

const parseSongName = (fileName: string) => {
  const name = stripExt(fileName)
  const result = /^(.+?)\s+-\s+(.+)$/.exec(name)
  if (!result) return { name, singer: '' }
  return {
    name: result[2].trim() || name,
    singer: result[1].trim(),
  }
}

const webDAVFetch = async(url: string, config: LX.Music.WebDAVConfig, options: WebDAVRequestOptions = {}) => {
  assertConfig(config)
  if (!isUrlWithinRoot(config.url, url)) throw new Error('WebDAV request escaped the configured root')
  const resp = await global.fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: getWebDAVAuthHeader(config),
      ...options.headers,
    },
    body: options.body,
  })
  if (!resp.ok) throw new Error(`WebDAV request failed: ${resp.status}`)
  return resp
}

const propfind = async(url: string, rootUrl: string, config: LX.Music.WebDAVConfig) => {
  const resp = await webDAVFetch(normalizeDirUrl(url), config, {
    method: 'PROPFIND',
    headers: {
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>',
  })
  return parsePropfindResponse(await resp.text(), url, rootUrl)
}

const scanMusics = async(rootUrl: string, config: LX.Music.WebDAVConfig) => {
  const queue = [normalizeDirUrl(rootUrl)]
  const visited = new Set<string>()
  const files: WebDAVEntry[] = []

  while (queue.length) {
    const currentUrl = queue.shift()!
    if (visited.has(currentUrl)) continue
    visited.add(currentUrl)
    const entries = await propfind(currentUrl, rootUrl, config)
    for (const entry of entries) {
      if (entry.isDirectory) {
        queue.push(normalizeDirUrl(entry.url))
        continue
      }
      files.push(entry)
    }
  }

  const sidecars = new Map<string, {
    lyricPath?: string
    krcPath?: string
    picPath?: string
  }>()
  for (const entry of files) {
    const fileName = getFileName(entry.path)
    const ext = getExt(fileName)
    if (!LYRIC_EXTS.has(ext) && !KRC_EXTS.has(ext) && !PIC_EXTS.has(ext)) continue
    const key = getBasePath(entry.path)
    const info = sidecars.get(key) ?? {}
    if (LYRIC_EXTS.has(ext)) info.lyricPath = entry.path
    else if (KRC_EXTS.has(ext)) info.krcPath = entry.path
    else if (info.picPath == null || ext == 'jpg' || ext == 'jpeg') info.picPath = entry.path
    sidecars.set(key, info)
  }

  const musics: LX.Music.MusicInfoWebDAV[] = []
  for (const entry of files) {
    const fileName = getFileName(entry.path)
    const ext = getExt(fileName)
    if (!AUDIO_EXTS.has(ext)) continue
    const fileInfo = parseSongName(fileName)
    const sidecar = sidecars.get(getBasePath(entry.path))
    const id = `webdav_${toMD5(`${normalizeDirUrl(rootUrl)}\n${entry.path}`)}`

    musics.push({
      id,
      name: fileInfo.name,
      singer: fileInfo.singer,
      source: 'webdav',
      interval: null,
      meta: {
        songId: entry.path,
        albumName: '',
        picUrl: sidecar?.picPath ? `webdav:${sidecar.picPath}` : null,
        url: normalizeDirUrl(rootUrl),
        path: entry.path,
        fileName,
        ext,
        title: null,
        artist: null,
        album: null,
        albumArtist: null,
        year: null,
        genre: null,
        hasEmbeddedPic: false,
        embeddedLyric: null,
        lyricPath: sidecar?.lyricPath ?? null,
        krcPath: sidecar?.krcPath ?? null,
        picPath: sidecar?.picPath ?? null,
        size: entry.size,
        etag: entry.etag,
        lastModified: entry.lastModified,
      },
    })
  }

  return musics
}

export const testWebDAV = async(config: LX.Music.WebDAVConfig) => {
  assertConfig(config)
  await propfind(config.url, config.url, config)
  return true
}

export const listWebDAVMusics = async(params?: LX.Music.WebDAVListMusicParams) => {
  const settingConfig = getConfiguredWebDAV()
  const config: LX.Music.WebDAVConfig = {
    url: params?.url ?? settingConfig.url,
    username: params?.username ?? settingConfig.username,
    password: params?.password ?? settingConfig.password,
  }
  assertConfig(config)
  return scanMusics(config.url, config)
}

export const getWebDAVFileResource = (musicInfo: LX.Music.MusicInfoWebDAV, filePath: string = musicInfo.meta.path): WebDAVResource => {
  const config = getConfiguredWebDAV()
  assertConfig(config)
  if (!isSameWebDAVRoot(musicInfo.meta.url, config.url)) {
    throw new Error('WebDAV music source does not match the configured server')
  }
  const base = parseUrl(normalizeDirUrl(config.url))
  const relativePath = normalizeRelativeFilePath(filePath)
  const url = buildUrl({
    origin: base.origin,
    pathname: `${base.pathname}${relativePath}`,
    search: base.search,
    hash: base.hash,
  })
  if (!isUrlWithinRoot(config.url, url)) throw new Error('WebDAV file escaped the configured root')
  return {
    url,
    headers: {
      Authorization: getWebDAVAuthHeader(config),
    },
  }
}

const blobToBuffer = async(blob: Blob) => new Promise<Buffer>((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => {
    reject(reader.error ?? new Error('Failed to read WebDAV response'))
  }
  reader.onload = () => {
    const result = reader.result
    if (typeof result != 'string') {
      reject(new Error('Invalid WebDAV response'))
      return
    }
    const base64 = result.slice(result.indexOf('base64,') + 7)
    resolve(Buffer.from(base64, 'base64'))
  }
  reader.readAsDataURL(blob)
})

const readWebDAVBuffer = async(musicInfo: LX.Music.MusicInfoWebDAV, filePath: string) => {
  const resource = getWebDAVFileResource(musicInfo, filePath)
  const resp = await webDAVFetch(resource.url, getConfiguredWebDAV(), { headers: {} })
  return blobToBuffer(await resp.blob())
}

export const readWebDAVText = async(musicInfo: LX.Music.MusicInfoWebDAV, filePath: string) => {
  return (await readWebDAVBuffer(musicInfo, filePath)).toString('utf-8')
}

export const readWebDAVPic = async(musicInfo: LX.Music.MusicInfoWebDAV) => {
  // Embedded artwork is not available yet; use a same-name sidecar image when present.
  if (!musicInfo.meta.picPath) return ''
  const buffer = await readWebDAVBuffer(musicInfo, musicInfo.meta.picPath)
  const ext = getExt(musicInfo.meta.picPath) || 'jpeg'
  const mime = ext == 'jpg' ? 'jpeg' : ext
  return `data:image/${mime};base64,${buffer.toString('base64')}`
}

const parseKrc = (str: string): LX.Music.LyricInfo => {
  const headExp = /^.*\[id:\$\w+\]\n/
  str = str.replace(/\r/g, '')
  if (headExp.test(str)) str = str.replace(headExp, '')
  const trans = str.match(/\[language:([\w=\\/+]+)\]/)
  let rlyric: string[][] | undefined
  let tlyric: string[][] | undefined
  if (trans) {
    str = str.replace(/\[language:[\w=\\/+]+\]\n/, '')
    const json = JSON.parse(Buffer.from(trans[1], 'base64').toString())
    for (const item of json.content) {
      switch (item.type) {
        case 0:
          rlyric = item.lyricContent
          break
        case 1:
          tlyric = item.lyricContent
          break
      }
    }
  }
  let i = 0
  let lxlyric = str.replace(/\[((\d+),\d+)\].*/g, line => {
    const result = line.match(/\[((\d+),\d+)\].*/)
    if (!result) return line
    let timeNum = parseInt(result[2])
    const ms = timeNum % 1000
    timeNum /= 1000
    const m = Math.trunc(timeNum / 60).toString().padStart(2, '0')
    timeNum %= 60
    const s = Math.trunc(timeNum).toString().padStart(2, '0')
    const time = `${m}:${s}.${ms}`
    if (rlyric) rlyric[i] = [`[${time}]${rlyric[i]?.join('') ?? ''}`]
    if (tlyric) tlyric[i] = [`[${time}]${tlyric[i]?.join('') ?? ''}`]
    i++
    return line.replace(result[1], time)
  })
  const rlyricText = rlyric ? decodeName(rlyric.map(line => line.join('')).join('\n')) : ''
  const tlyricText = tlyric ? decodeName(tlyric.map(line => line.join('')).join('\n')) : ''
  lxlyric = decodeName(lxlyric.replace(/<(\d+,\d+),\d+>/g, '<$1>'))
  return {
    lyric: lxlyric.replace(/<\d+,\d+>/g, ''),
    tlyric: tlyricText,
    rlyric: rlyricText,
    lxlyric,
  }
}

const decodeKrc = (buffer: Buffer) => {
  const encKey = Buffer.from([0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69])
  const data = Buffer.from(buffer).slice(4)
  for (let i = 0, len = data.length; i < len; i++) data[i] = data[i] ^ encKey[i % 16]
  return parseKrc(pako.inflate(data, { to: 'string' }))
}

export const readWebDAVLyric = async(musicInfo: LX.Music.MusicInfoWebDAV): Promise<LX.Music.LyricInfo | null> => {
  if (musicInfo.meta.lyricPath) {
    const lyric = await readWebDAVText(musicInfo, musicInfo.meta.lyricPath)
    if (lyric.trim()) return { lyric }
  }
  if (musicInfo.meta.krcPath) return decodeKrc(await readWebDAVBuffer(musicInfo, musicInfo.meta.krcPath))
  if (musicInfo.meta.embeddedLyric) return { lyric: musicInfo.meta.embeddedLyric }
  return null
}
