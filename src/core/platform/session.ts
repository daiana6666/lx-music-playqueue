export interface PlatformProfile { id: string, nickname: string, avatarUrl?: string }
export interface PlatformAccount { cookie: string, profile: PlatformProfile, updatedAt: number }
export interface CredentialStorage {
  read: (provider: string) => Promise<string | null>
  write: (provider: string, value: string) => Promise<void>
  remove: (provider: string) => Promise<void>
}

export class StaleAccountError extends Error {
  constructor() { super('账号或登录请求已改变'); this.name = 'StaleAccountError' }
}

/** All native writes are serialized, including cleanup after a cancelled in-flight write. */
export const createAccountSession = (provider: string, storage: CredentialStorage, changed: () => void = () => {}) => {
  let generation = 0
  let account: PlatformAccount | null = null
  let initialized = false
  let unavailable = false
  let tail: Promise<unknown> = Promise.resolve()
  const enqueue = async<T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task)
    tail = result.catch(() => {})
    return result
  }
  const isCurrent = (expected: number) => expected == generation
  const assertCurrent = (expected: number) => { if (!isCurrent(expected)) throw new StaleAccountError() }
  const initialize = async() => enqueue(async() => {
    if (initialized) return
    const expected = generation
    try {
      const value = await storage.read(provider)
      assertCurrent(expected)
      if (value) {
        const data: PlatformAccount = JSON.parse(value)
        if (!data.cookie || !data.profile?.id || !Number.isFinite(data.updatedAt)) throw new Error('Invalid credential')
        account = data
      }
    } catch (error) {
      if (!isCurrent(expected)) throw new StaleAccountError()
      unavailable = true
      account = null
    }
    // Serialized with logout, and guarded after the native read.
    // eslint-disable-next-line require-atomic-updates
    initialized = true
    changed()
  })
  const save = async(data: PlatformAccount, expected: number) => enqueue(async() => {
    assertCurrent(expected)
    await storage.write(provider, JSON.stringify(data))
    if (!isCurrent(expected)) {
      if (account) await storage.write(provider, JSON.stringify(account))
      else await storage.remove(provider)
      throw new StaleAccountError()
    }
    account = data
    initialized = true
    unavailable = false
    changed()
  })
  const invalidate = () => { generation++; return generation }
  const logout = async() => {
    invalidate()
    account = null
    unavailable = false
    initialized = true
    changed()
    await enqueue(async() => { await storage.remove(provider) })
  }
  return {
    initialize,
    save,
    logout,
    invalidate,
    isCurrent,
    assertCurrent,
    generation: () => generation,
    account: () => account,
    status: () => ({ profile: account?.profile ?? null, loggedIn: !!account, unavailable }),
  }
}

export const playlistIdentity = (item: LX.PlatformPlaylistSummary): string =>
  ['platform', item.provider, item.accountKey, item.kind, item.id].map(encodeURIComponent).join(':')

/** Offset pagination must make progress and may never silently truncate at a server cap. */
export const collectPages = async<T>(load: (page: number) => Promise<{ items: T[], total?: number, more?: boolean }>, id: (item: T) => string, current: () => boolean = () => true): Promise<T[]> => {
  const items = new Map<string, T>()
  for (let page = 1; page <= 1000; page++) {
    const result = await load(page)
    if (!current()) throw new StaleAccountError()
    const before = items.size
    for (const item of result.items) items.set(id(item), item)
    if (result.total != null && (!Number.isSafeInteger(result.total) || result.total < 0)) throw new Error('歌单数量无效')
    if (result.more === false && (result.total == null || items.size >= result.total)) return [...items.values()]
    if (result.total != null && items.size >= result.total && result.more !== true) return [...items.values()]
    if (result.total == null && result.more !== true && !result.items.length) return [...items.values()]
    if (items.size == before) throw new Error('平台分页未完整返回，已保留上次内容')
  }
  throw new Error('平台分页超过上限，已保留上次内容')
}
