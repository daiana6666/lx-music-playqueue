import { getAccountStatus, logout } from '@/core/netease'
import state, { emptyStatus } from './state'

export const setNeteaseAccountStatus = (status: LX.Netease.AccountStatus) => {
  state.accountStatus = status
  global.state_event.neteaseAccountStatusUpdated(status)
}

export const initNeteaseAccount = async(force = false) => {
  if (state.isInitingNeteaseAccount) return state.accountStatus
  if (state.isNeteaseAccountInited && !force) return state.accountStatus
  state.isInitingNeteaseAccount = true
  try {
    const status = await getAccountStatus()
    setNeteaseAccountStatus(status)
    state.isNeteaseAccountInited = true
    return status
  } finally {
    state.isInitingNeteaseAccount = false
  }
}

export const logoutNeteaseAccount = async() => {
  setNeteaseAccountStatus({ ...emptyStatus })
  await logout()
}

export default {
  initNeteaseAccount,
  setNeteaseAccountStatus,
  logoutNeteaseAccount,
}
