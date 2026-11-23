import { buildLyricInfo } from './utils'
import { getWebDAVFileResource, readWebDAVLyric, readWebDAVPic, type WebDAVResource } from '@/core/webdav'

export const getMusicUrl = async({ musicInfo }: {
  musicInfo: LX.Music.MusicInfoWebDAV
  isRefresh: boolean
}): Promise<WebDAVResource> => {
  return getWebDAVFileResource(musicInfo)
}

export const getPicUrl = async({ musicInfo }: {
  musicInfo: LX.Music.MusicInfoWebDAV
  listId?: string | null
  isRefresh: boolean
}): Promise<string> => {
  if (!musicInfo.meta.picPath) return musicInfo.meta.picUrl?.startsWith('webdav:') ? '' : musicInfo.meta.picUrl ?? ''
  return readWebDAVPic(musicInfo)
}

export const getLyricInfo = async({ musicInfo }: {
  musicInfo: LX.Music.MusicInfoWebDAV
  isRefresh: boolean
}): Promise<LX.Player.LyricInfo> => {
  const lyricInfo = await readWebDAVLyric(musicInfo)
  return buildLyricInfo(lyricInfo ?? {
    lyric: '',
    tlyric: '',
    rlyric: '',
    lxlyric: '',
  })
}
