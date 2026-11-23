export interface InitState {
  isPrivateFmActive: boolean
  privateFmMode: LX.Netease.PrivateFmModeId
  privateFmList: LX.Music.MusicInfoOnline[]
  isLoadingPrivateFm: boolean
}

const state: InitState = {
  isPrivateFmActive: false,
  privateFmMode: 'DEFAULT',
  privateFmList: [],
  isLoadingPrivateFm: false,
}

export default state
