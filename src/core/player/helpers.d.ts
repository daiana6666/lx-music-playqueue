import type { PlayerResourceInput } from '@/plugins/player/utils'

export function getTargetMusicInfo(
  musicInfo: LX.Player.PlayMusic | LX.Music.MusicInfo | LX.Download.ListItem,
): LX.Music.MusicInfo

export function createPlayerMusicIdentity(
  musicInfo: LX.Player.PlayMusic | LX.Music.MusicInfo | LX.Download.ListItem | null | undefined,
): string

export function createGettingUrlId(
  musicInfo: LX.Player.PlayMusic | LX.Music.MusicInfo | LX.Download.ListItem,
): string

export function shouldClearGettingUrlId(
  requestMusicInfo: LX.Player.PlayMusic | LX.Music.MusicInfo | LX.Download.ListItem,
  currentMusicInfo: LX.Player.PlayMusic | LX.Music.MusicInfo | LX.Download.ListItem | null | undefined,
): boolean

export function shouldUseProjectSourceOnly(
  musicInfo: LX.Player.PlayMusic | LX.Music.MusicInfo | LX.Download.ListItem | null | undefined,
): boolean

export function resolveProjectSourceResource<Input>(params: {
  cachedMusicInfo?: LX.Music.MusicInfoOnline | null
  matchedList?: Input[]
  getMatchedList?: () => Promise<Input[]>
  normalizeMusicInfo: (musicInfo: Input) => LX.Music.MusicInfoOnline
  canUse: (musicInfo: LX.Music.MusicInfoOnline) => boolean
  getResource: (musicInfo: LX.Music.MusicInfoOnline) => Promise<PlayerResourceInput>
}): Promise<{
  musicInfo: LX.Music.MusicInfoOnline
  resource: PlayerResourceInput
} | null>

export function runWithLoadingState<T>(
  state: { isLoading: boolean },
  task: () => Promise<T>,
): Promise<T | undefined>
