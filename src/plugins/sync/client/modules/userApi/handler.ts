import { handleRemoteUserApiAction } from '../../../userApiEvent'
import log from '../../../log'

const logInfo = (eventName: string, success = false) => {
  log.info(`[${eventName}]${eventName.replace('userApi:sync:', '').replace(/_/g, ' ')}${success ? ' success' : ''}`)
}

const handler: LX.Sync.ClientSyncHandlerUserApiActions<LX.Sync.Socket> = {
  async onUserApiSyncAction(socket, action) {
    if (!socket.moduleReadys?.userApi) return
    await handleRemoteUserApiAction(action)
  },

  async user_api_sync_finished(socket) {
    logInfo('userApi:sync:finished')
    socket.moduleReadys.userApi = true
  },
}

export default handler
