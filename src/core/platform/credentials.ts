import { playbackCoordinator } from '@/core/music/playbackSession'
import { NativeModules } from 'react-native'
import { type CredentialStorage } from './session'
import { randomHex, md5 } from './crypto'

export const credentialStorage: CredentialStorage = {
  read: async provider => NativeModules.PlatformCredentials.read(provider),
  write: async(provider, value) => { playbackCoordinator.invalidate(); await NativeModules.PlatformCredentials.write(provider, value) },
  remove: async provider => { playbackCoordinator.invalidate(); await NativeModules.PlatformCredentials.remove(provider) },
}

let devicePromise: Promise<Record<string, string>> | null = null
export const getDeviceProfile = async(): Promise<Record<string, string>> => {
  devicePromise ??= (async() => {
    const saved = await credentialStorage.read('device')
    if (saved) return JSON.parse(saved) as Record<string, string>
    const guid = randomHex(16)
    const data = {
      KUGOU_API_GUID: guid,
      KUGOU_API_MID: BigInt(`0x${md5(guid)}`).toString(10),
      KUGOU_API_DEV: randomHex(5).toUpperCase(),
      KUGOU_API_WEBGL: BigInt(`0x${randomHex(8)}`).toString(10),
    }
    await credentialStorage.write('device', JSON.stringify(data))
    return data
  })().catch(error => { devicePromise = null; throw error })
  return devicePromise
}
