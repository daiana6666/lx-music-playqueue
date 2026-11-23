export interface InitState {
  recentPlayList: LX.Music.MusicInfo[]
  isRecentPlayInited: boolean
}

const state: InitState = {
  recentPlayList: [],
  isRecentPlayInited: false,
}

export default state
