export const MAX_BACKUP_BYTES: number
export function decodeBackup(bytes: Uint8Array): unknown
export function validatePlaylistBackup<T>(value: T): T
export function getBackupProfiles(lists: Array<{ id: string, profile?: LX.List.UserListProfile, group?: LX.List.UserListGroup }>): Record<string, LX.List.UserListProfile>
