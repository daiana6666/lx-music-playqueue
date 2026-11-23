import { Alert, NativeModules } from 'react-native'
import * as legacy from './legacyStorage'
import { credentialStorage } from '@/core/platform/credentials'
import AsyncStorage from '@react-native-async-storage/async-storage'

const db = NativeModules.UserData as {
  initialized: () => Promise<boolean>
  migrate: (rows: Array<[string, string]>) => Promise<void>
  read: (key: string) => Promise<string | null>
  keys: () => Promise<string[]>
  write: (rows: Array<[string, string]>, removals: string[], snapshot: boolean) => Promise<void>
  recover: () => Promise<void>
  scrub: (key: string) => Promise<void>
}
let initialization: Promise<void> | null = null
let writesSuspended = false
let webdavUnavailable = false
export const initializeStorage = async() => {
  initialization ??= (async() => {
    if (await db.initialized()) return
    // Decode chunks before the single transaction; failures preserve the old database.
    const keys = (await legacy.getAllKeys()).filter(key => !key.startsWith('@___PART'))
    const rows: Array<[string, string]> = []
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key)
      const pointer = raw?.startsWith(`${key}:`) && keys.includes(raw) && /^@(playlist_profiles_v1|user_api_catalog_v1|platform_catalog_v1)/.test(key)
      const value = await legacy.getData(pointer ? raw! : key)
      if (value != null) rows.push([key, JSON.stringify(value)])
    }
    await db.migrate(rows)
  })().catch(error => { initialization = null; throw error })
  return initialization
}
export const getData = async<T = unknown>(key: string): Promise<T | null> => {
  await initializeStorage()
  const provider = secretProvider(key)
  if (provider) return secureTask(provider, async() => await readSecret(key, provider)) as Promise<T | null>
  const value = await db.read(key)
  if (value == null) return null
  const parsed = JSON.parse(value)
  if (key == '@setting_v1') {
    return secureTask('webdav', async() => {
      let password: unknown
      try { password = await readSecret('@webdav_password', 'webdav', parsed['webdav.password']) } catch {
        webdavUnavailable = true
        Alert.alert('WebDAV 需要重新认证', '设备安全存储不可用。原数据已保留，请在 WebDAV 设置中重新输入密码。')
        const result: T = { ...parsed, 'webdav.password': '' }
        return result
      }
      if (parsed['webdav.password']) {
        await db.write([[key, JSON.stringify({ ...parsed, 'webdav.password': '' })]], [], false)
        await scrubLegacySecret(key)
      }
      const result: T = { ...parsed, 'webdav.password': password ?? '' }
      return result
    })
  }
  return parsed as T
}
export const saveDataMultiple = async(datas: Array<[string, any]>) => {
  await initializeStorage()
  if (writesSuspended) return
  const rows: Array<[string, string]> = []
  for (const [key, value] of datas) {
    const provider = secretProvider(key)
    if (provider) {
      await secureTask(provider, async() => writeSecret(key, provider, value))
    } else if (key == '@setting_v1') {
      if (webdavUnavailable && !value['webdav.password']) continue
      if (typeof value['webdav.password'] == 'string') {
        await secureTask('webdav', async() => writeSecret('@webdav_password', 'webdav', value['webdav.password']))
        // Writes to this provider are serialized by secureTask.
        // eslint-disable-next-line require-atomic-updates
        webdavUnavailable = false
      }
      rows.push([key, JSON.stringify({ ...value, 'webdav.password': '' })])
    } else rows.push([key, JSON.stringify(value)])
  }
  if (!writesSuspended) await db.write(rows, [], false)
}
export const saveData = async(key: string, value: any) => saveDataMultiple([[key, value]])
export const removeDataMultiple = async(keys: string[]) => {
  await initializeStorage()
  if (writesSuspended) return
  for (const key of keys) {
    const provider = secretProvider(key)
    if (provider) await secureTask(provider, async() => writeSecret(key, provider, null))
  }
  if (!writesSuspended) await db.write([], keys, false)
}
export const removeData = async(key: string) => removeDataMultiple([key])
export const getAllKeys = async() => { await initializeStorage(); return db.keys() }
export const getDataMultiple = async<T extends readonly string[]>(keys: T) => {
  const rows = await Promise.all(keys.map(async key => [key, await getData(key)]))
  return rows as { [K in keyof T]: [T[K], unknown] }
}
export const clearAll = async() => removeDataMultiple(await getAllKeys())
export const restoreData = async(rows: Array<[string, unknown]>, removals: string[] = []) => {
  await initializeStorage()
  writesSuspended = true
  try { await db.write(rows.map(([key, value]) => [key, JSON.stringify(value)]), removals, true) } catch (error) { writesSuspended = false; throw error }
}
export const recoverData = async() => {
  await initializeStorage()
  writesSuspended = true
  try { await db.recover() } catch (error) { writesSuspended = false; throw error }
}
export const scrubLegacySecret = async(key: string) => {
  await legacy.removeData(key)
  await db.scrub(key)
}
const secretProvider = (key: string) => key == '@netease_account' ? 'netease' : key == '@sync_auth_key' ? 'sync' : null
const secretTails = new Map<string, Promise<unknown>>()
const secureTask = async<T>(provider: string, task: () => Promise<T>): Promise<T> => {
  const result = (secretTails.get(provider) ?? Promise.resolve()).then(task)
  secretTails.set(provider, result.catch(() => {}))
  return result
}
const writeSecret = async(key: string, provider: string, value: unknown) => {
  const text = JSON.stringify(value ?? null)
  if (await credentialStorage.read(provider).catch(() => null) != text) {
    await credentialStorage.write(provider, text)
    if (await credentialStorage.read(provider) != text) throw new Error('凭据安全存储验证失败，请重新认证')
  }
  await db.write([[`@secure_migration:${provider}`, '1']], [key], false)
  await scrubLegacySecret(key)
}
const readSecret = async(key: string, provider: string, fallback?: unknown): Promise<any> => {
  const migrated = await db.read(`@secure_migration:${provider}`)
  const saved = await credentialStorage.read(provider)
  if (migrated) {
    if (saved == null) throw new Error('安全凭据不可用，请重新登录或配置认证')
    return JSON.parse(saved)
  }
  const old = await db.read(key)
  const value = saved != null ? JSON.parse(saved) : old != null ? JSON.parse(old) : fallback ?? null
  await writeSecret(key, provider, value)
  return value
}
export { useAsyncStorage } from '@react-native-async-storage/async-storage'
