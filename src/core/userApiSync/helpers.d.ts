export const DESKTOP_REMOTE_SOURCE: 'desktop'

export function normalizeSyncApiInfo(
  api: LX.Sync.UserApi.ApiInfo,
  existingApi?: LX.UserApi.UserApiInfo,
  usedIds?: Set<string>,
): LX.UserApi.UserApiInfo

export function normalizeApiInfoForSync(
  api: LX.UserApi.UserApiInfo,
  script: string,
): LX.Sync.UserApi.ApiInfo

export function validateUserApiSyncData(data: LX.Sync.UserApi.Data): void

export function buildUserApiOverwrite(
  existingApis: LX.UserApi.UserApiInfo[],
  data: LX.Sync.UserApi.Data,
): {
  nextApis: LX.UserApi.UserApiInfo[]
  removedScriptIds: string[]
  scriptsToSave: Array<[string, string]>
}

export function buildUserApiSyncData(
  apis: LX.UserApi.UserApiInfo[],
  getScript: (id: string) => Promise<string>,
  updatedAt?: number,
): Promise<LX.Sync.UserApi.Data>

export function getUserApiSyncComparableData(data: LX.Sync.UserApi.Data): {
  source: 'desktop'
  apis: Array<{
    id: string
    name: string
    description: string
    author: string
    homepage: string
    version: string
    allowShowUpdateAlert?: boolean
    scriptEncoding: 'plain'
    script: string
    remote?: LX.UserApi.GitHubRemote
  }>
}

export function resolveSyncedApiSource(
  activeApiId: string,
  nextApis: LX.UserApi.UserApiInfo[],
  fallbackApiId: string,
): string
