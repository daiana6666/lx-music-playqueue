import { applyProfileSnapshot, getListProfiles, onProfilesChanged } from '@/core/listProfile'
import { normalizeSnapshot } from '@/core/listProfile/sync'
import listState from '@/store/list/state'
import { SYNC_CLOSE_CODE } from '@/plugins/sync/constants'

const getListIds = () => ['default', 'love', ...listState.userList.map(list => list.id)]
const snapshot = async() => normalizeSnapshot({ version: 1, profiles: await getListProfiles(), listIds: getListIds() })
export const handler = {
  async profile_sync_get(socket: LX.Sync.Socket) {
    if (!socket.moduleReadys.list) throw new Error('Playlist sync is not ready')
    return snapshot()
  },
  async profile_sync_apply(socket: LX.Sync.Socket, base: LX.Sync.ProfileSnapshot, next: LX.Sync.ProfileSnapshot) {
    if (!socket.moduleReadys.list) throw new Error('Playlist sync is not ready')
    await applyProfileSnapshot(normalizeSnapshot(base), normalizeSnapshot(next), getListIds)
    return snapshot()
  },
  async profile_sync_finished(socket: LX.Sync.Socket) {
    socket.moduleReadys.listProfile = true
    registerEvent(socket)
    socket.onClose(unregisterEvent)
  },
}
let removeListener: (() => void) | undefined
let removeListListener: (() => void) | undefined
export const unregisterEvent = () => { removeListener?.(); removeListListener?.(); removeListener = undefined; removeListListener = undefined }
export const registerEvent = (socket: LX.Sync.Socket) => {
  unregisterEvent()
  const request = () => {
    if (!socket.moduleReadys?.listProfile) return
    void socket.remoteQueueListProfile.profile_sync_request().catch(() => {
      socket.moduleReadys.listProfile = false
      socket.close(SYNC_CLOSE_CODE.failed)
    })
  }
  removeListener = onProfilesChanged(remote => { if (!remote) request() })
  global.state_event.on('mylistUpdated', request)
  removeListListener = () => { global.state_event.off('mylistUpdated', request) }
}
