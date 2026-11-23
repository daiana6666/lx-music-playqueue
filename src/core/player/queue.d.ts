export function isPlayableRecord(value: unknown): value is LX.Music.MusicInfo
export function findQueueEntry(list: LX.Player.PlayMusicInfo[], entry: LX.Player.PlayMusicInfo): LX.Player.PlayMusicInfo | undefined
export { createPlayerMusicIdentity, getTargetMusicInfo } from './helpers'
export interface QueueRow {
  kind: 'current' | 'later' | 'pending' | 'history' | 'random' | 'party'
  entry: LX.Player.PlayMusicInfo
  key: string
  partyId?: string
  roomId?: string
}
export interface QueueSection { kind: 'current' | 'later' | 'pending' | 'history', data: QueueRow[] }
export function buildQueueSections(input: {
  current: { musicInfo: LX.Player.PlayMusic | null, listId: string | null, isTempPlay: boolean }
  temp: LX.Player.PlayMusicInfo[]
  history: LX.Player.PlayMusicInfo[]
  playlist: LX.Player.PlayMusic[]
  candidates?: { list: LX.Player.PlayMusic[], index: number }
  listId: string | null
  playerIndex: number
  mode: LX.AppSetting['player.togglePlayMethod']
  randomNext: LX.Player.PlayMusicInfo | null
  privateFm: boolean
  room: LX.Party.RoomSnapshot | null
}): QueueSection[]
