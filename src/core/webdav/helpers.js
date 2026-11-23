const normalizeDirUrl = url => {
  const parsed = parseUrl(url)
  parsed.pathname = normalizeDirPathname(parsed.pathname)
  return buildUrl(parsed)
}

const normalizeDirPathname = pathname => pathname.endsWith('/') ? pathname : `${pathname}/`

const decodeXmlText = value => String(value).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
  switch (code.toLowerCase()) {
    case 'amp': return '&'
    case 'lt': return '<'
    case 'gt': return '>'
    case 'quot': return '"'
    case 'apos': return "'"
    default: {
      const isHex = code[1].toLowerCase() == 'x'
      const value = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isFinite(value) ? String.fromCodePoint(value) : entity
    }
  }
})

const parseUrl = url => {
  const match = /^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(String(url))
  if (!match) throw new Error('Invalid WebDAV url')
  return {
    origin: `${match[1].toLowerCase()}://${match[2]}`,
    pathname: match[3] || '/',
    search: match[4] || '',
    hash: match[5] || '',
  }
}

const decodePathSegments = pathname => pathname.split('/').map(part => {
  const decoded = decodeURIComponent(part)
  if (/[\\/]/.test(decoded)) throw new Error('Invalid WebDAV path')
  let probe = decoded
  for (let index = 0; index < 2; index++) {
    let next
    try {
      next = decodeURIComponent(probe)
    } catch {
      break
    }
    if (next == probe) break
    if (next == '..' || /[\\/]/.test(next)) throw new Error('Invalid WebDAV path')
    probe = next
  }
  return decoded
})

const canonicalizePathname = pathname => {
  const trailingSlash = pathname.endsWith('/')
  const stack = []
  for (const part of decodePathSegments(pathname)) {
    if (!part || part == '.') continue
    if (part == '..') stack.pop()
    else stack.push(part)
  }
  const result = `/${stack.join('/')}`
  return trailingSlash && result != '/' ? `${result}/` : result
}

const encodePathname = pathname => canonicalizePathname(pathname)
  .split('/')
  .map(part => encodeURIComponent(part))
  .join('/')

const buildUrl = ({ origin, pathname, search = '', hash = '' }) => {
  return `${origin}${encodePathname(pathname)}${search}${hash}`
}

const splitRelativeUrl = href => {
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(href)
  return {
    pathname: match?.[1] ?? href,
    search: match?.[2] ?? '',
    hash: match?.[3] ?? '',
  }
}

const resolveRelativePath = (basePath, href) => {
  const stack = canonicalizePathname(basePath).split('/').filter(Boolean)
  if (!basePath.endsWith('/')) stack.pop()
  for (const part of decodePathSegments(href)) {
    if (!part || part == '.') continue
    if (part == '..') stack.pop()
    else stack.push(part)
  }
  return `/${stack.join('/')}`
}

const buildChildUrl = (baseUrl, rawHref) => {
  const href = String(rawHref).trim()
  if (/^https?:\/\//i.test(href)) return buildUrl(parseUrl(href))

  const base = parseUrl(normalizeDirUrl(baseUrl))
  const relative = splitRelativeUrl(href)
  const pathname = relative.pathname.startsWith('/')
    ? relative.pathname
    : resolveRelativePath(base.pathname, relative.pathname)
  return buildUrl({
    origin: base.origin,
    pathname,
    search: relative.search,
    hash: relative.hash,
  })
}

const normalizeOrigin = origin => origin.toLowerCase()

const getRelativePath = (rootUrl, childUrl) => {
  const root = parseUrl(normalizeDirUrl(rootUrl))
  const child = parseUrl(childUrl)
  if (normalizeOrigin(root.origin) != normalizeOrigin(child.origin)) return null

  const rootPath = canonicalizePathname(normalizeDirPathname(root.pathname))
  const childPath = canonicalizePathname(child.pathname)
  if (childPath == rootPath.slice(0, -1)) return ''
  if (!childPath.startsWith(rootPath)) return null
  return childPath.slice(rootPath.length)
}

const isUrlWithinRoot = (rootUrl, targetUrl) => getRelativePath(rootUrl, targetUrl) != null

const isSameWebDAVRoot = (leftUrl, rightUrl) => {
  const left = parseUrl(normalizeDirUrl(leftUrl))
  const right = parseUrl(normalizeDirUrl(rightUrl))
  return normalizeOrigin(left.origin) == normalizeOrigin(right.origin) &&
    canonicalizePathname(normalizeDirPathname(left.pathname)) == canonicalizePathname(normalizeDirPathname(right.pathname))
}

const normalizeRelativeFilePath = filePath => {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(filePath)) throw new Error('Invalid WebDAV file path')
  const parts = []
  for (const part of decodePathSegments(String(filePath).replace(/^\/+/, ''))) {
    if (!part || part == '.') continue
    if (part == '..') throw new Error('Invalid WebDAV file path')
    parts.push(part)
  }
  if (!parts.length) throw new Error('Invalid WebDAV file path')
  return parts.join('/')
}

const parsePropfindResponse = (xml, requestUrl, rootUrl) => {
  const entries = []
  const responseReg = /<(?:\w+:)?response\b[\s\S]*?<\/(?:\w+:)?response>/gi
  const tagValue = (block, tag) => {
    const reg = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i')
    const value = reg.exec(block)?.[1]?.trim()
    return value == null ? undefined : decodeXmlText(value)
  }

  for (const [response] of String(xml).matchAll(responseReg)) {
    try {
      const href = tagValue(response, 'href')
      if (!href) continue
      const url = buildChildUrl(requestUrl, href)
      const path = getRelativePath(rootUrl, url)
      if (!path) continue
      const isDirectory = /<(?:\w+:)?collection\b/i.test(response)
      const sizeRaw = tagValue(response, 'getcontentlength')
      const size = sizeRaw ? Number(sizeRaw) : undefined
      entries.push({
        url,
        path,
        isDirectory,
        size: Number.isFinite(size) ? size : undefined,
        etag: tagValue(response, 'getetag'),
        lastModified: tagValue(response, 'getlastmodified'),
      })
    } catch {
      // Ignore malformed or out-of-root response entries without aborting the scan.
    }
  }
  return entries
}

module.exports = {
  buildChildUrl,
  buildUrl,
  getRelativePath,
  isSameWebDAVRoot,
  isUrlWithinRoot,
  normalizeDirUrl,
  normalizeRelativeFilePath,
  parsePropfindResponse,
  parseUrl,
}
