import playerState from '@/store/player/state'
import listState from '@/store/list/state'
import settingState from '@/store/setting/state'
import privateFmState from '@/store/privateFm/state'
import partyState from '@/store/party/state'
import { state as dislikeState } from '@/store/dislikeList'
import { filterMusicList } from './utils'
import { canControlPartyPlayback, playPartyQueueItem } from '@/core/party'
import { getList } from './playInfo'
import { buildQueueSections, type QueueRow } from './queue'
import { peekRandomNextMusicInfo, playQueuedMusicInfo, play, resetRandomNextMusicInfo } from './player'
import { removeTempPlayList } from './tempPlayList'
import { PRIVATE_FM_TEMP_LIST_ID } from '@/store/privateFm/action'

export const getPlaybackQueue = () => {
  const listId = playerState.playInfo.playerListId
  const playlist = listId ? getList(listId) : []
  const filtered = filterMusicList({
    listId: listId ?? '',
    list: playlist,
    playedList: playerState.playedList,
    playerMusicInfo: playlist[playerState.playInfo.playerPlayIndex],
    dislikeInfo: dislikeState.dislikeInfo,
    isNext: true,
  })
  return buildQueueSections({
    current: playerState.playMusicInfo,
    temp: playerState.tempPlayList,
    history: playerState.playedList,
    playlist,
    candidates: { list: filtered.filteredList.length ? filtered.filteredList : filtered.canPlayList, index: Math.max(0, filtered.playerIndex) },
    listId,
    playerIndex: playerState.playInfo.playerPlayIndex,
    mode: settingState.setting['player.togglePlayMethod'],
    randomNext: peekRandomNextMusicInfo(),
    privateFm: privateFmState.isPrivateFmActive && listState.tempListMeta.id == PRIVATE_FM_TEMP_LIST_ID,
    room: partyState.room,
  })
}

export const removePlaybackQueueItem = (row: QueueRow) => {
  if (row.kind != 'later') return
  const index = playerState.tempPlayList.indexOf(row.entry)
  if (index >= 0) removeTempPlayList(index)
}

export const playPlaybackQueueItem = async(row: QueueRow) => {
  const fresh = getPlaybackQueue().flatMap(section => section.data).find(item => item.key == row.key)
  if (!fresh) throw new Error(global.i18n.t('phase1_queue_changed'))
  if (partyState.room && !canControlPartyPlayback()) throw new Error(global.i18n.t('phase1_queue_no_control'))
  if (fresh.kind == 'party' && fresh.partyId && fresh.roomId) {
    await playPartyQueueItem(fresh.roomId, fresh.partyId)
    return
  }
  if (fresh.kind == 'current') {
    play()
    return
  }
  if (fresh.kind == 'later') removePlaybackQueueItem(fresh)
  resetRandomNextMusicInfo()
  await playQueuedMusicInfo(fresh.entry)
}
