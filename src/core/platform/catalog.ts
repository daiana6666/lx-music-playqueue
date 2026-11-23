import { createAtomicSnapshot } from '@/utils/atomicSnapshot'
import { collectPages, playlistIdentity } from './session'
import { accountCall, assertGeneration, generation, getPlatformPlaylistPage, getPlatformPlaylists, getPlatformStatus, type Provider } from './index'

interface CatalogSnapshot { version: 1, directories: Partial<Record<LX.PlatformPlaylistKind, LX.PlatformPlaylistSummary[]>>, details: Record<string, LX.Music.MusicInfo[]> }
const stores = new Map<string, ReturnType<typeof createAtomicSnapshot<CatalogSnapshot>>>()
const flights = new Map<string, Promise<any>>()
const writes = new Map<string, Promise<unknown>>()
const scope = (provider: Provider) => `${provider}:${encodeURIComponent(getPlatformStatus(provider).profile?.id ?? 'public')}`
const store = (key: string) => {
  let storage = stores.get(key)
  if (!storage) { storage = createAtomicSnapshot<CatalogSnapshot>(`@platform_catalog_v1:${key}`); stores.set(key, storage) }
  return storage
}
const read = async(key: string): Promise<CatalogSnapshot> => await store(key).read() ?? { version: 1, directories: {}, details: {} }
const write = async(key: string, provider: Provider, expected: number, update: (previous: CatalogSnapshot) => CatalogSnapshot) => {
  const task = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async() => {
    assertGeneration(provider, expected)
    const previous = await read(key)
    assertGeneration(provider, expected)
    await store(key).write(update(previous))
    assertGeneration(provider, expected)
  })
  writes.set(key, task)
  await task
}
const once = async<T>(key: string, task: () => Promise<T>): Promise<T> => {
  const existing = flights.get(key)
  if (existing) return existing
  const promise = task()
  flights.set(key, promise)
  try { return await promise } finally { if (flights.get(key) == promise) flights.delete(key) }
}
export const cachedPlatformPlaylists = async(provider: Provider, kind: LX.PlatformPlaylistKind) => {
  const expected = generation(provider)
  const value = (await read(scope(provider))).directories[kind] ?? []
  assertGeneration(provider, expected)
  return value
}
export const refreshPlatformPlaylists = async(provider: Provider, kind: LX.PlatformPlaylistKind) => {
  const expected = generation(provider)
  const key = scope(provider)
  return once(`${key}:${expected}:${kind}`, async() => {
    const items = await getPlatformPlaylists(provider, kind)
    assertGeneration(provider, expected)
    const unique = [...new Map(items.map(item => [playlistIdentity(item), item])).values()]
    await write(key, provider, expected, previous => ({ ...previous, directories: { ...previous.directories, [kind]: unique } }))
    return unique
  })
}
export const cachedPlatformSongs = async(provider: Provider, id: string): Promise<LX.Music.MusicInfo[]> => {
  const expected = generation(provider)
  const value = (await read(scope(provider))).details[id] ?? []
  assertGeneration(provider, expected)
  return value
}
export const refreshPlatformSongs = async(provider: Provider, id: string): Promise<LX.Music.MusicInfo[]> => {
  const expected = generation(provider)
  const key = scope(provider)
  return once(`${key}:${expected}:songs:${id}`, async() => accountCall(provider, async() => {
    const list = await collectPages(async page => {
      const data = await getPlatformPlaylistPage(provider, id, page)
      return { items: data.list, total: data.total }
    }, item => `${item.source}:${item.id}`, () => generation(provider) == expected)
    await write(key, provider, expected, previous => ({ ...previous, details: { ...previous.details, [id]: list } }))
    return list
  }))
}
