import versionActions from '@/store/version/action'
import versionState from '@/store/version/state'
import { saveIgnoreVersion } from '@/utils/data'
import { Navigation } from 'react-native-navigation'

const markUpdateCheckDisabled = () => {
  versionActions.setVersionInfo({
    status: 'idle',
    isLatest: true,
    isUnknown: false,
    newVersion: null,
  })
}

export const showModal = () => {
  markUpdateCheckDisabled()
}

export const hideModal = (componentId: string) => {
  if (!versionState.showModal) return
  versionActions.setVisibleModal(false)
  void Navigation.dismissOverlay(componentId)
}

export const checkUpdate = async() => {
  markUpdateCheckDisabled()
}

export const downloadUpdate = () => {
  markUpdateCheckDisabled()
}

export const setIgnoreVersion = (version: string | null) => {
  versionActions.setIgnoreVersion(version)
  saveIgnoreVersion(version)
}
