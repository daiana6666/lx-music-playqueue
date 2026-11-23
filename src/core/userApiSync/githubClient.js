const { sha1 } = require('@noble/hashes/sha1')
const { sha256 } = require('@noble/hashes/sha256')
const { bytesToHex } = require('@noble/hashes/utils')
const { createGitHubRequest } = require('./githubRequest')
const { readGitHubGitSnapshot } = require('./githubGit')
const { canonicalizeRemote, REPOSITORY } = require('./remote')
const { parseGitHubUserApiSnapshot, downloadGitHubUserApiScripts, buildGitHubUserApiRawUrl, buildGitHubUserApiCdnUrl, GITHUB_USER_API_LIMITS } = require('./github')

const verifyScriptBlob = (file, script) => {
  const bytes = typeof script == 'string' ? Buffer.from(script, 'utf8') : script
  const actual = bytesToHex(sha1.create().update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest())
  if (bytes.length != file.size || actual != file.blobSha.toLowerCase()) throw new Error(`GitHub file verification failed: ${file.path}`)
  return script
}
const createGitHubClient = (request = fetch) => {
  const fetchContent = createGitHubRequest(request)
  const gitScripts = new WeakMap()
  return {
    async getSnapshot() {
      const base = `https://api.github.com/repos/${REPOSITORY}`
      let branch
      try {
        branch = JSON.parse(await fetchContent(`${base}/branches/main`, 1000000))
        if (!/^[a-f0-9]{40}$/i.test(branch?.commit?.sha ?? '')) throw new Error('Invalid GitHub commit')
        const tree = JSON.parse(await fetchContent(`${base}/git/trees/${branch.commit.sha}?recursive=1`, 10000000))
        return parseGitHubUserApiSnapshot(branch, tree)
      } catch (error) {
        // Protocol/size validation errors must not be bypassed through another transport.
        if (!['GITHUB_RATE_LIMIT', 'GITHUB_FORBIDDEN', 'GITHUB_NOT_FOUND', 'GITHUB_HTTP_ERROR', 'GITHUB_TIMEOUT', 'GITHUB_NETWORK_ERROR'].includes(error.code)) throw error
        try {
          const { snapshot, scripts } = await readGitHubGitSnapshot(fetchContent, branch?.commit?.sha)
          gitScripts.set(snapshot, scripts)
          return snapshot
        } catch (fallbackError) {
          throw Object.assign(new Error(`${error.message}\n${fallbackError.message}`), { code: 'GITHUB_SNAPSHOT_FAILED', failures: [error, fallbackError] })
        }
      }
    },
    async downloadSnapshot(snapshot) {
      const invalid = new Map()
      const items = await downloadGitHubUserApiScripts(snapshot, async file => {
        const read = async url => verifyScriptBlob(file, await fetchContent(url, GITHUB_USER_API_LIMITS.maxScriptBytes, { binary: true, attempts: 2 }))
        let bytes = gitScripts.get(snapshot)?.get(file.blobSha)
        if (bytes) verifyScriptBlob(file, bytes)
        const failures = []
        for (const url of [buildGitHubUserApiRawUrl(snapshot.commitSha, file.path), buildGitHubUserApiCdnUrl(snapshot.commitSha, file.path)]) {
          if (bytes) break
          try { bytes = await read(url); break } catch (error) { failures.push(error) }
        }
        if (!bytes) {
          // The official blob endpoint avoids raw/CDN routing and missing CDN cache entries.
          // Decode the pinned blob, then apply the same byte length and Git SHA checks.
          try {
            const data = JSON.parse(await fetchContent(`https://api.github.com/repos/${REPOSITORY}/git/blobs/${file.blobSha}`, Math.ceil(file.size * 1.5) + 4096))
            if (data.encoding != 'base64' || data.sha != file.blobSha || typeof data.content != 'string') throw new Error('Invalid GitHub blob response')
            bytes = verifyScriptBlob(file, Buffer.from(data.content, 'base64'))
          } catch (error) {
            failures.push(error)
            throw Object.assign(new Error(`${file.path}\n${failures.map(item => item.message).join('\n')}`), { code: 'GITHUB_DOWNLOAD_FAILED', failures, path: file.path })
          }
        }
        const script = Buffer.from(bytes).toString('utf8')
        if (bytes.includes(0) || !Buffer.from(script, 'utf8').equals(Buffer.from(bytes))) {
          invalid.set(file.path, 'not a UTF-8 text source')
          return ''
        }
        return script.replace(/^\uFEFF/, '')
      })
      return items.map(item => invalid.has(item.remote.path) ? { ...item, invalidReason: invalid.get(item.remote.path) } : item)
    },
  }
}
const buildGitHubReplacement = (existing, items) => {
  if (!items.length || items.length > GITHUB_USER_API_LIMITS.maxFiles) throw new Error('Invalid GitHub source batch')
  const skipped = []
  const incoming = []
  const paths = new Set()
  let snapshot
  let size = 0
  for (const item of items) {
    const remote = canonicalizeRemote(item.remote)
    if (!remote || typeof item.script != 'string' || paths.has(remote.path)) throw new Error('Invalid or duplicate GitHub source')
    const key = remote.commitSha + remote.version
    if (snapshot && snapshot != key) throw new Error('Mixed GitHub snapshots')
    snapshot = key
    paths.add(remote.path)
    const bytes = Buffer.byteLength(item.script, 'utf8')
    size += bytes
    if (bytes > GITHUB_USER_API_LIMITS.maxScriptBytes || size > GITHUB_USER_API_LIMITS.maxTotalBytes) throw new Error('GitHub source batch exceeds size limit')
    if (item.invalidReason) { skipped.push(`${remote.path}: ${item.invalidReason}`); continue }
    const header = /^\/\*[\s\S]+?\*\//.exec(item.script)
    if (!header) { skipped.push(`${remote.path}: missing source header`); continue }
    const info = { name: '', description: '', author: '', homepage: '', version: '' }
    for (const line of header[0].split(/\r?\n/)) {
      const match = /^\s?\*\s?@(\w+)\s(.+)$/.exec(line)
      if (match && Object.hasOwn(info, match[1])) info[match[1]] = match[2].trim().slice(0, match[1] == 'homepage' ? 1024 : 200)
    }
    if (!info.name) info.name = remote.path.split('/').pop()
    incoming.push({ remote, info, script: item.script })
  }
  if (!incoming.length) throw new Error(`No valid GitHub sources; existing sources retained. ${skipped.join('; ')}`)
  const isManaged = api => {
    try { return canonicalizeRemote(api.remote)?.repository == REPOSITORY } catch { return false }
  }
  const preserved = existing.filter(api => !isManaged(api))
  const used = new Set(preserved.map(api => api.id))
  const scriptsToSave = []
  const managed = incoming.map(({ info, remote, script }) => {
    const previous = existing.find(api => isManaged(api) && api.remote.path == remote.path)
    const remoteId = `user_api_github_${bytesToHex(sha256(Buffer.from(remote.path, 'utf8'))).slice(0, 16)}`
    let id = previous?.id ?? remoteId
    while (used.has(id)) id += '_1'
    used.add(id)
    scriptsToSave.push([id, script])
    return { ...info, id, remoteId: previous?.remoteId ?? remoteId, remoteSource: 'desktop', allowShowUpdateAlert: previous?.allowShowUpdateAlert ?? true, remote }
  })
  return { nextApis: [...preserved, ...managed], scriptsToSave, skipped }
}
module.exports = { createGitHubClient, buildGitHubReplacement, verifyScriptBlob }
