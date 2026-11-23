import { createDefaultListeningTimeStats } from '@/core/netease/helpers'

export interface InitState {
  listeningTimeStats: LX.Netease.ListeningTimeStats
  isListeningTimeInited: boolean
}

const state: InitState = {
  listeningTimeStats: createDefaultListeningTimeStats(),
  isListeningTimeInited: false,
}

export default state
