interface Catalog { apis: LX.UserApi.UserApiInfo[], scripts: Record<string, string> }
export function createUserApiRepository(io: {
  snapshot: { read: () => Promise<Catalog | null>, write: (catalog: Catalog) => Promise<void> }
  loadLegacy: () => Promise<Catalog>
  readScript: (key: string) => Promise<string>
  writeScript: (key: string, script: string) => Promise<void>
  removeScript: (key: string) => Promise<void>
  createKey: (id: string) => string
}): {
  getList: () => Promise<LX.UserApi.UserApiInfo[]>
  getScript: (id: string) => Promise<string>
  readAll: () => Promise<Array<LX.UserApi.UserApiInfo & { script: string }>>
  mutate: (build: (apis: LX.UserApi.UserApiInfo[]) => { nextApis: LX.UserApi.UserApiInfo[], scriptsToSave?: Array<[string, string]> }) => Promise<LX.UserApi.UserApiInfo[]>
}
