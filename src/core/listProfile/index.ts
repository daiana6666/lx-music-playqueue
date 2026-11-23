import { useEffect, useSyncExternalStore } from 'react'
import { createAtomicSnapshot } from '@/utils/atomicSnapshot'
import { normalizeProfile } from './helpers'
import { rebaseSnapshot, type ProfileSnapshot } from './sync'

interface ProfileState {
  profiles: Record<string, LX.List.UserListProfile>
  collapsed: Partial<Record<LX.List.UserListGroup, boolean>>
}
const storage = createAtomicSnapshot<ProfileState>('@playlist_profiles_v1')
let state: ProfileState = { profiles: {}, collapsed: {} }
let initialized: Promise<void> | undefined
let tail: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()
const changeListeners = new Set<(remote: boolean) => void>()
export const subscribeProfiles = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const onProfilesChanged = (listener: (remote: boolean) => void) => {
  changeListeners.add(listener)
  return () => { changeListeners.delete(listener) }
}
export const initListProfiles = async() => {
  initialized ??= storage.read().then(saved => {
    if (saved) {
      state = {
        profiles: Object.fromEntries(Object.entries(saved.profiles ?? {}).map(([id, profile]) => [id, normalizeProfile(profile)])),
        collapsed: { mine: saved.collapsed?.mine === true, external: saved.collapsed?.external === true },
      }
    }
    for (const listener of listeners) listener()
  }).catch(error => { initialized = undefined; throw error })
  await initialized
}
const mutate = async(update: (current: ProfileState) => ProfileState, remote: boolean, profilesChanged: boolean) => {
  const operation = tail.catch(() => {}).then(async() => {
    await initListProfiles()
    const next = update(state)
    await storage.write(next)
    // All reads and commits in this block are serialized by tail.
    // eslint-disable-next-line require-atomic-updates
    state = next
    for (const listener of listeners) listener()
    if (profilesChanged) for (const listener of changeListeners) listener(remote)
  })
  tail = operation
  await operation
}
export const getListProfiles = async() => {
  await initListProfiles()
  return JSON.parse(JSON.stringify(state.profiles)) as ProfileState['profiles']
}
export const applyListProfiles = async(changes: Record<string, LX.List.UserListProfile | null>, remote = false) => {
  await mutate(current => {
    const profiles = { ...current.profiles }
    for (const [id, value] of Object.entries(changes)) {
      if (value === null) delete profiles[id]
      else profiles[id] = { ...profiles[id], ...normalizeProfile(value) }
    }
    return { ...current, profiles }
  }, remote, true)
}
export const removeListProfiles = async(ids: string[], remote = false) => {
  if (ids.length) await applyListProfiles(Object.fromEntries(ids.map(id => [id, null])), remote)
}
export const setGroupCollapsed = async(group: LX.List.UserListGroup, collapsed: boolean) => {
  await mutate(current => ({ ...current, collapsed: { ...current.collapsed, [group]: collapsed } }), false, false)
}
export const applyProfileSnapshot = async(base: ProfileSnapshot, incoming: ProfileSnapshot, getListIds: () => string[]) => {
  await mutate(current => {
    const next = rebaseSnapshot({ version: 1, listIds: getListIds(), profiles: current.profiles }, incoming, base)
    return { ...current, profiles: next.profiles }
  }, true, true)
}
export const useListProfiles = () => {
  useEffect(() => { void initListProfiles().catch(error => { console.warn('Playlist profiles could not be loaded', error) }) }, [])
  return useSyncExternalStore(subscribeProfiles, () => state)
}
