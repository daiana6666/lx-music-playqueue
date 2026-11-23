import { userApiNative, onScriptAction, type RequestParams, type ResponseParams } from '@/utils/nativeModules/userApi'
import { getUserApiScript } from '@/utils/data'
import { state } from '@/store/userApi'
import { fetchData } from '@/core/init/userApi/request'
import BackgroundTimer from 'react-native-background-timer'

interface Runtime {
  id: string
  sourceId: string
  fingerprint: string
  sources: Partial<LX.UserApi.UserApiSources>
  pending: Map<string, { resolve: (result: any) => void, reject: (error: Error) => void }>
  requests: Map<string, { abort: () => void }>
  ready: Promise<Runtime>
  resolve: (runtime: Runtime) => void
  reject: (error: Error) => void
  closing: boolean
  usedAt: number
}
const pool = new Map<string, Runtime>()
let creationTail: Promise<unknown> = Promise.resolve()
let initialized = false
let sequence = 0
export const sourceFingerprint = (info: LX.UserApi.UserApiInfo) => `${info.id}:${info.version}:${info.remote?.blobSha ?? ''}`
const cancelled = () => new Error('cancel request')
const closeRuntime = async(runtime: Runtime) => {
  if (runtime.closing) return
  runtime.closing = true
  runtime.reject(cancelled())
  for (const request of runtime.pending.values()) request.reject(cancelled())
  runtime.pending.clear()
  for (const request of runtime.requests.values()) request.abort()
  runtime.requests.clear()
  // Keep the slot occupied until native destruction finishes.
  await userApiNative.destroy(runtime.id)
  pool.delete(runtime.id)
}
export const invalidateSourceRuntimes = async(sourceIds?: string[]) => {
  await Promise.all([...pool.values()].filter(runtime => !sourceIds || sourceIds.includes(runtime.sourceId)).map(closeRuntime))
}
export const initSourceRuntime = () => {
  if (initialized) return
  initialized = true
  onScriptAction(event => {
    const runtime = pool.get(event.runtimeId)
    if (!runtime || runtime.closing) return
    if (event.action == 'init') {
      if (!event.data.status) {
        runtime.reject(new Error('音源初始化失败'))
        void closeRuntime(runtime)
        return
      }
      runtime.sources = event.data.info?.sources ?? {}
      runtime.resolve(runtime)
    } else if (event.action == 'response') {
      const result = event.data as ResponseParams
      const request = runtime.pending.get(result.requestKey)
      if (!request) return
      runtime.pending.delete(result.requestKey)
      if (result.status) request.resolve(result.result)
      else request.reject(new Error(result.errorMessage ?? '音源解析失败'))
    } else if (event.action == 'request') {
      const { requestKey, url, options } = event.data as RequestParams
      if (runtime.requests.size >= 24 || !/^https?:\/\//i.test(url)) {
        userApiNative.sendAction(runtime.id, 'response', JSON.stringify({ requestKey, error: 'Source request limit exceeded', response: null }))
        return
      }
      const request = fetchData(url, { ...options, timeout: Math.min(20000, Math.max(1000, options.timeout || 13000)) })
      runtime.requests.set(requestKey, request)
      void request.request.then(response => {
        if (!runtime.closing && runtime.requests.get(requestKey) === request) userApiNative.sendAction(runtime.id, 'response', JSON.stringify({ requestKey, error: null, response }))
      }).catch(() => {
        if (!runtime.closing && runtime.requests.get(requestKey) === request) userApiNative.sendAction(runtime.id, 'response', JSON.stringify({ requestKey, error: 'Network request failed', response: null }))
      }).finally(() => { runtime.requests.delete(requestKey) })
    } else if (event.action == 'cancelRequest') {
      runtime.requests.get(event.data as string)?.abort()
      runtime.requests.delete(event.data as string)
    } else if (event.action == 'showUpdateAlert') {
      const source = state.list.find(item => item.id == runtime.sourceId)
      if (!source?.allowShowUpdateAlert || typeof event.data?.log != 'string') return
      const message = `${source.name}\n${event.data.log.slice(0, 1024)}`
      const url = event.data.updateUrl
      void import('@/utils/tools').then(async({ confirmDialog, tipDialog, openUrl }) => {
        if (typeof url == 'string' && url.length <= 1024 && /^https?:\/\//i.test(url)) {
          if (await confirmDialog({ message, confirmButtonText: global.i18n.t('user_api_update_alert_open_url'), cancelButtonText: global.i18n.t('close') })) await openUrl(url)
        } else await tipDialog({ message, btnText: global.i18n.t('ok') })
      }).catch(() => {})
    }
  })
}
export const getSourceRuntime = async(sourceId: string): Promise<Runtime> => {
  initSourceRuntime()
  const task = creationTail.then(async() => {
    const info = state.list.find(item => item.id == sourceId)
    if (!info) throw new Error('音源已删除')
    const fingerprint = sourceFingerprint(info)
    const existing = [...pool.values()].find(item => !item.closing && item.sourceId == sourceId && item.fingerprint == fingerprint)
    if (existing) { existing.usedAt = Date.now(); return existing.ready }
    if (pool.size >= 3) {
      const idle = [...pool.values()].filter(item => !item.pending.size && !item.closing).sort((a, b) => a.usedAt - b.usedAt)[0]
      if (!idle) throw new Error('音源正在使用，请稍后重试')
      await closeRuntime(idle)
    }
    let resolve!: Runtime['resolve']
    let reject!: Runtime['reject']
    const ready = new Promise<Runtime>((_resolve, _reject) => { resolve = _resolve; reject = _reject })
    const runtime: Runtime = { id: `${sourceId}:${++sequence}`, sourceId, fingerprint, sources: {}, pending: new Map(), requests: new Map(), ready, resolve, reject, closing: false, usedAt: Date.now() }
    void ready.catch(() => {})
    pool.set(runtime.id, runtime)
    const timeout = BackgroundTimer.setTimeout(() => { reject(new Error('音源初始化超时')); void closeRuntime(runtime) }, 10000)
    try {
      const script = await getUserApiScript(sourceId)
      if (runtime.closing) throw cancelled()
      await userApiNative.loadScript({ ...info, runtimeId: runtime.id, script })
      return await ready
    } catch (error) {
      void closeRuntime(runtime)
      throw error
    } finally { BackgroundTimer.clearTimeout(timeout) }
  })
  creationTail = task.catch(() => {})
  return task
}
export const requestSource = async(sourceId: string, source: LX.Source, action: LX.UserApi.UserApiSourceInfoActions, musicInfo: unknown, quality: LX.Quality, signal?: AbortSignal) => {
  if (signal?.aborted) throw cancelled()
  const runtime = await getSourceRuntime(sourceId)
  if (signal?.aborted === true || runtime.closing) throw cancelled()
  if (!runtime.sources[source]?.actions.includes(action)) throw new Error('音源不支持此平台')
  const key = `${runtime.id}:request:${++sequence}`
  let timer: number | undefined
  let abort: () => void = () => {}
  try {
    return await new Promise<any>((resolve, reject) => {
      abort = () => { runtime.pending.delete(key); reject(cancelled()) }
      signal?.addEventListener('abort', abort, { once: true })
      timer = BackgroundTimer.setTimeout(() => { runtime.pending.delete(key); reject(new Error('音源解析超时')) }, 20000)
      runtime.pending.set(key, { resolve, reject })
      userApiNative.sendAction(runtime.id, 'request', JSON.stringify({ requestKey: key, data: { source, action, info: { type: quality, musicInfo } } }))
    })
  } finally {
    if (timer != null) BackgroundTimer.clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    runtime.pending.delete(key)
    if (!runtime.pending.size) {
      for (const request of runtime.requests.values()) request.abort()
      runtime.requests.clear()
    }
  }
}
export const loadPrimarySource = async(info: LX.UserApi.UserApiInfo) => {
  const runtime = await getSourceRuntime(info.id)
  const apis: Record<string, any> = {}
  const qualitys: LX.QualityList = {}
  for (const [source, capability] of Object.entries(runtime.sources)) {
    if (!capability) continue
    const make = (action: LX.UserApi.UserApiSourceInfoActions) => (musicInfo: unknown, quality: LX.Quality = '128k') => {
      const controller = new AbortController()
      return {
        canceleFn: () => { controller.abort() },
        promise: requestSource(info.id, source as LX.Source, action, musicInfo, quality, controller.signal).then(result => action == 'musicUrl' ? { url: result.data.url, type: result.data.quality } : result.data),
      }
    }
    apis[source] = { getMusicUrl: make('musicUrl'), getLyric: make('lyric'), getPic: make('pic') }
    qualitys[source as LX.Source] = capability.qualitys
  }
  return { apis, qualitys }
}
