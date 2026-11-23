const wait = delay => new Promise(resolve => setTimeout(resolve, delay))
const retryableStatus = new Set([408, 425, 429, 500, 502, 503, 504])
const requestError = (code, message, fields = {}) => Object.assign(new Error(message), { code, ...fields })

const createGitHubRequest = (request, { delay = wait, timeoutMs = 20000 } = {}) => async(url, maxBytes, { binary = false, attempts = 3, method = 'GET', body, headers = {} } = {}) => {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    let timeout
    try {
      return await Promise.race([
        (async() => {
          const response = await request(url, {
            signal: controller.signal,
            method,
            body,
            headers: { Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json', ...headers },
          })
          if (!response.ok) {
            const status = response.status
            const remaining = response.headers.get('x-ratelimit-remaining')
            const retryAfter = response.headers.get('retry-after')
            const resetAt = Number(response.headers.get('x-ratelimit-reset')) * 1000
            const rateLimited = status == 429 || (status == 403 && (remaining == '0' || retryAfter != null))
            const code = rateLimited ? 'GITHUB_RATE_LIMIT' : status == 404 ? 'GITHUB_NOT_FOUND' : status == 403 ? 'GITHUB_FORBIDDEN' : 'GITHUB_HTTP_ERROR'
            throw requestError(code, `HTTP ${status}: ${url}`, {
              status,
              url,
              resetAt: resetAt || undefined,
              retryAfter: retryAfter == null ? undefined : Number(retryAfter),
              retryable: !rateLimited && retryableStatus.has(status),
            })
          }
          if (Number(response.headers.get('content-length')) > maxBytes) throw requestError('GITHUB_SIZE_LIMIT', 'GitHub response exceeds size limit', { url })
          const content = binary ? new Uint8Array(await response.arrayBuffer()) : await response.text()
          if ((binary ? content.length : Buffer.byteLength(content, 'utf8')) > maxBytes) throw requestError('GITHUB_SIZE_LIMIT', 'GitHub response exceeds size limit', { url })
          return content
        })(),
        new Promise((resolve, reject) => {
          timeout = setTimeout(() => {
            reject(requestError('GITHUB_TIMEOUT', `Request timed out: ${url}`, { url, retryable: true }))
            controller.abort()
          }, timeoutMs)
        }),
      ])
    } catch (cause) {
      const error = cause?.code?.startsWith('GITHUB_') ? cause : requestError('GITHUB_NETWORK_ERROR', `${cause?.message ?? cause}: ${url}`, { url, retryable: true })
      if (!error.retryable || attempt >= attempts - 1) throw error
    } finally { clearTimeout(timeout) }
    await delay([300, 1200][Math.min(attempt, 1)])
  }
}

module.exports = { createGitHubRequest }
