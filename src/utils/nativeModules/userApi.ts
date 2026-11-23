import { NativeEventEmitter, NativeModules } from 'react-native'

export const userApiNative = NativeModules.UserApiModule as {
  loadScript: (data: Record<string, unknown>) => Promise<void>
  sendAction: (runtimeId: string, action: string, data: string) => void
  destroy: (runtimeId: string) => Promise<void>
}
export interface ResponseParams { status: boolean, errorMessage?: string, requestKey: string, result: any }
export interface RequestParams {
  requestKey: string
  url: string
  options: { method: string, data: any, timeout: number, headers: any, binary: boolean }
}
export const onScriptAction = (handler: (event: { runtimeId: string, action: string, data: any }) => void) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const emitter = new NativeEventEmitter(NativeModules.UserApiModule)
  const subscription = emitter.addListener('api-action', event => {
    try {
      if (event.data) event.data = JSON.parse(event.data as string)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      handler(event)
    } catch { /* Discard malformed source events. */ }
  })
  return () => { subscription.remove() }
}
