import log from '../../../log'
import { ensurePartyRoomLoaded, handlePartyRoomSnapshot, setPartyModuleReady } from '@/core/party'

const logInfo = (eventName: string) => {
  log.info(`[${eventName}] party sync action`)
}

const handler: LX.Sync.ClientSyncHandlerPartyActions<LX.Sync.Socket> = {
  async onPartySyncAction(socket, action) {
    logInfo(`party:${action.data.reason}`)
    handlePartyRoomSnapshot(action.data.room)
  },

  async party_sync_set_room_state(socket, room) {
    logInfo('party:set_room_state')
    handlePartyRoomSnapshot(room)
  },

  async party_sync_finished(socket) {
    logInfo('party:finished')
    socket.moduleReadys.party = true
    setPartyModuleReady(true)
    socket.onClose(() => {
      setPartyModuleReady(false)
    })
    await ensurePartyRoomLoaded()
  },
}

export default handler
