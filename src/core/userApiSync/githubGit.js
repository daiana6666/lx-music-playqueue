const { REPOSITORY } = require('./remote')
const { GITHUB_USER_API_LIMITS, parseGitHubUserApiSnapshot, createGitHubUserApiError } = require('./github')
const { packet, readMainRef, readUploadPack } = require('./gitPack')
const { bytesToHex } = require('@noble/hashes/utils')

const baseUrl = `https://github.com/${REPOSITORY}`
const invalid = detail => { throw createGitHubUserApiError('GITHUB_GIT_INVALID', detail) }
const readTree = (objects, sha) => {
  const object = objects.get(sha)
  if (object?.type != 'tree') invalid('missing tree')
  const bytes = object.bytes
  const entries = []
  const names = new Set()
  let offset = 0
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset)
    const zero = bytes.indexOf(0, space + 1)
    if (space < offset || zero < space || zero + 21 > bytes.length) invalid('truncated tree')
    const mode = bytes.toString('ascii', offset, space)
    const rawName = Buffer.from(bytes.subarray(space + 1, zero))
    const name = rawName.toString('utf8')
    if (!['40000', '100644', '100755', '120000', '160000'].includes(mode) ||
      !name || name == '.' || name == '..' || /[/\\]/.test(name) ||
      !Buffer.from(name).equals(rawName) || names.has(name)) invalid('tree entry')
    names.add(name)
    entries.push({ mode, name, sha: bytesToHex(bytes.subarray(zero + 1, zero + 21)) })
    offset = zero + 21
  }
  return entries
}

// Smart HTTP uses GitHub's public Git service, independently of REST API quotas.
// Fetch only the current commit/trees, then the selected version's script blobs.
const readGitHubGitSnapshot = async(fetchContent, knownCommit) => {
  const commitSha = knownCommit ?? readMainRef(await fetchContent(`${baseUrl}/info/refs?service=git-upload-pack`, 1000000, { binary: true, attempts: 2 }))
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) invalid('commit SHA')
  const fetchObjects = async(shas, metadata) => {
    const body = shas.map((sha, index) => packet(`want ${sha}${index ? '' : ` no-progress${metadata ? ' filter' : ''}`}\n`)).join('') +
      (metadata ? packet('deepen 1\n') + packet('filter blob:none\n') : '') + '0000' + packet('done\n')
    const limits = metadata ? { maxObjects: 4096, maxObjectBytes: 1000000, maxTotalBytes: 10000000 } : {
      maxObjects: GITHUB_USER_API_LIMITS.maxFiles,
      maxObjectBytes: GITHUB_USER_API_LIMITS.maxScriptBytes,
      maxTotalBytes: GITHUB_USER_API_LIMITS.maxTotalBytes,
    }
    const bytes = await fetchContent(`${baseUrl}/git-upload-pack`, limits.maxTotalBytes + 1000000, {
      binary: true,
      attempts: 2,
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-git-upload-pack-request', Accept: 'application/x-git-upload-pack-result' },
    })
    return readUploadPack(bytes, limits)
  }
  const objects = await fetchObjects([commitSha], true)
  const commit = objects.get(commitSha.toLowerCase())
  const rootSha = commit?.type == 'commit' && /^tree ([a-f0-9]{40})\n/.exec(commit.bytes.toString('utf8'))?.[1]
  if (!rootSha) invalid('missing pinned commit')
  const root = readTree(objects, rootSha)
  const versions = root.filter(entry => entry.mode == '40000' && /^[vV]\d{6}$/.test(entry.name))
    .sort((a, b) => Number(b.name.slice(1)) - Number(a.name.slice(1)) || b.name.localeCompare(a.name))
  if (!versions.length) throw createGitHubUserApiError('GITHUB_VERSION_NOT_FOUND')
  const version = versions[0].name
  const files = []
  let directories = 0
  const visit = (sha, path, depth) => {
    if (++directories > 200 || depth > 16) invalid('directory limit')
    for (const entry of readTree(objects, sha)) {
      const filePath = `${path}/${entry.name}`
      if (entry.mode == '40000') visit(entry.sha, filePath, depth + 1)
      else if (/\.js$/i.test(entry.name)) {
        if (!['100644', '100755'].includes(entry.mode)) invalid('script is not a regular file')
        files.push({ type: 'blob', path: filePath, sha: entry.sha })
        if (files.length > GITHUB_USER_API_LIMITS.maxFiles) throw createGitHubUserApiError('GITHUB_BATCH_LIMIT', 'file count')
      }
    }
  }
  visit(versions[0].sha, version, 0)
  if (!files.length) throw createGitHubUserApiError('GITHUB_SCRIPTS_NOT_FOUND')
  const blobs = await fetchObjects([...new Set(files.map(file => file.sha))], false)
  const scripts = new Map()
  for (const file of files) {
    const blob = blobs.get(file.sha)
    if (blob?.type != 'blob') invalid(`missing pinned blob: ${file.path}`)
    file.size = blob.bytes.length
    scripts.set(file.sha, blob.bytes)
  }
  const snapshot = parseGitHubUserApiSnapshot({ commit: { sha: commitSha } }, {
    truncated: false,
    tree: [{ type: 'tree', path: version, sha: versions[0].sha }, ...files],
  })
  return { snapshot, scripts }
}

module.exports = { readGitHubGitSnapshot }
