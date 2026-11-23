import { memo, useEffect, useState } from 'react'
import Image from './common/Image'
import { getPicPath } from '@/core/music'

const resolved = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

export default memo(({ musicInfo, size = 40 }: { musicInfo: LX.Music.MusicInfo, size?: number }) => {
  const direct = musicInfo.meta?.picUrl
  const key = `${musicInfo.source}:${musicInfo.id}`
  const [loaded, setLoaded] = useState<{ key: string, url: string } | null>(null)
  const directUrl = direct && !direct.startsWith('webdav:') ? direct : undefined
  const url = directUrl ?? (loaded?.key == key ? loaded.url : resolved.get(key))
  useEffect(() => {
    if (directUrl != null || resolved.has(key) || !musicInfo.meta) return
    let active = true
    let request = pending.get(key)
    if (!request) {
      request = getPicPath({ musicInfo }).then(value => {
        if (value) {
          if (resolved.size >= 520) resolved.delete(resolved.keys().next().value!)
          resolved.set(key, value)
        }
        return value
      }).finally(() => { pending.delete(key) })
      pending.set(key, request)
    }
    void request.then(value => { if (active) setLoaded({ key, url: value }) }).catch(() => {})
    return () => { active = false }
  }, [key, directUrl, musicInfo])
  return <Image url={url} style={{ width: size, height: size, borderRadius: 5 }} />
})
