export const emptyStatus: LX.Netease.AccountStatus = {
  isLoggedIn: false,
  profile: null,
}

export interface InitState {
  accountStatus: LX.Netease.AccountStatus
  isInitingNeteaseAccount: boolean
  isNeteaseAccountInited: boolean
}

const state: InitState = {
  accountStatus: { ...emptyStatus },
  isInitingNeteaseAccount: false,
  isNeteaseAccountInited: false,
}

export default state
