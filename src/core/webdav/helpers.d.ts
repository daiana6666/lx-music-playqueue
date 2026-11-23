export interface WebDAVEntry {
  url: string
  path: string
  isDirectory: boolean
  size?: number
  etag?: string
  lastModified?: string
}

export interface ParsedWebDAVUrl {
  origin: string
  pathname: string
  search: string
  hash: string
}

export function normalizeDirUrl(url: string): string
export function parseUrl(url: string): ParsedWebDAVUrl
export function buildUrl(url: ParsedWebDAVUrl): string
export function buildChildUrl(baseUrl: string, href: string): string
export function getRelativePath(rootUrl: string, childUrl: string): string | null
export function isUrlWithinRoot(rootUrl: string, targetUrl: string): boolean
export function isSameWebDAVRoot(leftUrl: string, rightUrl: string): boolean
export function normalizeRelativeFilePath(filePath: string): string
export function parsePropfindResponse(xml: string, requestUrl: string, rootUrl: string): WebDAVEntry[]
