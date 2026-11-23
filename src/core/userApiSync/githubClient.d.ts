import type { GitHubUserApiSnapshot, GitHubUserApiDownload, GitHubUserApiSnapshotFile } from './github'
export function createGitHubClient(request?: typeof fetch): {
  getSnapshot: () => Promise<GitHubUserApiSnapshot>
  downloadSnapshot: (snapshot: GitHubUserApiSnapshot) => Promise<GitHubUserApiDownload[]>
}
export function buildGitHubReplacement(existing: LX.UserApi.UserApiInfo[], items: GitHubUserApiDownload[]): {
  nextApis: LX.UserApi.UserApiInfo[]
  scriptsToSave: Array<[string, string]>
  skipped: string[]
}
export function verifyScriptBlob(file: GitHubUserApiSnapshotFile, script: string): string
export function verifyScriptBlob(file: GitHubUserApiSnapshotFile, script: Uint8Array): Uint8Array
