// Desktop QQ RPCs carry ct=19/cv=2116; keep that profile coherent instead of changing only UA.
export const QQ_RPC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) QQMusic/21.16.0 Chrome/131.0.0.0 Safari/537.36'

/** Never log URLs, cookies, request bodies, or upstream authentication responses. */
export const platformFetch: typeof fetch = async(input, init = {}) => {
  const controller = new AbortController()
  const cancel = () => { controller.abort() }
  const headers = new Headers(init.headers)
  const url = String(input)
  if (/^https:\/\/(?:[a-z0-9-]+\.)*y\.qq\.com\//i.test(url)) {
    if (!headers.has('User-Agent')) headers.set('User-Agent', QQ_RPC_USER_AGENT)
    if (!headers.has('Referer')) headers.set('Referer', 'https://y.qq.com/')
    if (!headers.has('Origin')) headers.set('Origin', 'https://y.qq.com')
  }
  if (init.signal?.aborted) controller.abort()
  init.signal?.addEventListener('abort', cancel)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetch(input, { ...init, headers, credentials: 'omit', signal: controller.signal }),
      new Promise<never>((resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('平台请求超时，请重试')) }, 18000)
      }),
    ])
  } catch (error) {
    if (controller.signal.aborted) throw new Error('平台请求已取消或超时')
    throw new Error('平台网络请求失败，请重试')
  } finally {
    if (timer) clearTimeout(timer)
    init.signal?.removeEventListener('abort', cancel)
  }
}
