import { useMemo, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Input from '@/components/common/Input'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { usePartyRoom } from '@/store/party/hook'
import { usePlayMusicInfo } from '@/store/player/hook'
import { useStatus as useSyncStatus } from '@/store/sync/hook'
import {
  appendPartyQueue,
  copyPartyRoomCode,
  createPartyRoom,
  ensurePartyRoomLoaded,
  getPartyQueue,
  getPartyErrorMessage,
  getPartySelfMember,
  joinPartyRoom,
  leavePartyRoom,
  removePartyQueueItems,
} from '@/core/party'
import { confirmDialog, createStyle, toast } from '@/utils/tools'

const TEXT = {
  syncRequired: '\u8BF7\u5148\u8FDE\u63A5\u540C\u6B65\u670D\u52A1',
  roomCreated: '\u623F\u95F4\u5DF2\u521B\u5EFA',
  roomCodeRequired: '\u8BF7\u8F93\u5165\u623F\u95F4\u53F7',
  roomJoined: '\u5DF2\u52A0\u5165\u623F\u95F4',
  leaveTitle: '\u79BB\u5F00\u4E00\u8D77\u542C',
  leaveMessage: '\u786E\u5B9A\u8981\u9000\u51FA\u5F53\u524D\u623F\u95F4\u5417\uFF1F',
  roomLeft: '\u5DF2\u9000\u51FA\u623F\u95F4',
  panelTitle: '\u4E00\u8D77\u542C',
  roomPanelTitle: '\u4E00\u8D77\u542C\u623F\u95F4',
  inviteTitle: '\u9080\u8BF7\u670B\u53CB\u4E00\u8D77\u542C',
  inviteDesc: '\u521B\u5EFA\u623F\u95F4\u540E\uFF0C\u5F53\u524D\u64AD\u653E\u4F1A\u81EA\u52A8\u540C\u6B65\u7ED9\u623F\u95F4\u6210\u5458\uFF1B\u4E5F\u53EF\u4EE5\u76F4\u63A5\u8F93\u5165\u623F\u95F4\u53F7\u52A0\u5165\u3002',
  syncDesc: '\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u8FDE\u63A5\u540C\u6B65\u670D\u52A1\uFF0C\u518D\u4F7F\u7528\u4E00\u8D77\u542C\u529F\u80FD\u3002',
  nickname: '\u6211\u7684\u6635\u79F0',
  nicknamePlaceholder: '\u4F8B\u5982\uFF1A\u5C0F\u6797',
  roomName: '\u623F\u95F4\u540D\u79F0',
  roomNamePlaceholder: '\u53EF\u7559\u7A7A\uFF0C\u9ED8\u8BA4\u81EA\u52A8\u751F\u6210',
  roomCode: '\u623F\u95F4\u53F7',
  roomCodePlaceholder: '\u521B\u5EFA\u65F6\u53EF\u7559\u7A7A\uFF0C\u52A0\u5165\u65F6\u5FC5\u586B',
  password: '\u623F\u95F4\u5BC6\u7801',
  passwordPlaceholder: '\u6CA1\u6709\u53EF\u7559\u7A7A',
  creating: '\u521B\u5EFA\u4E2D...',
  createRoom: '\u521B\u5EFA\u623F\u95F4',
  joining: '\u52A0\u5165\u4E2D...',
  joinRoom: '\u52A0\u5165\u623F\u95F4',
  inviteTip: '\u628A\u623F\u95F4\u53F7\u53D1\u7ED9\u670B\u53CB\uFF0C\u4ED6\u4EEC\u5C31\u80FD\u5FEB\u901F\u52A0\u5165',
  online: '\u5728\u7EBF',
  allControl: '\u5168\u5458\u53EF\u63A7',
  hostControl: '\u623F\u4E3B\u63A7\u573A',
  youAreHost: '\u4F60\u662F\u623F\u4E3B',
  currentSong: '\u5F53\u524D\u540C\u6B65\u6B4C\u66F2',
  waitingSong: '\u7B49\u5F85\u540C\u6B65\u6B4C\u66F2',
  currentSongDesc: '\u623F\u95F4\u5EFA\u7ACB\u540E\u4F1A\u8DDF\u968F\u5F53\u524D\u64AD\u653E\u5185\u5BB9\u540C\u6B65',
  members: '\u623F\u95F4\u6210\u5458',
  host: '\u623F\u4E3B',
  offline: '\u79BB\u7EBF',
  copyRoomCode: '\u590D\u5236\u623F\u95F4\u53F7',
  leaving: '\u9000\u51FA\u4E2D...',
  leaveRoom: '\u9000\u51FA\u623F\u95F4',
  disconnected: '\u5F53\u524D\u540C\u6B65\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u623F\u95F4\u4FE1\u606F\u53EF\u80FD\u4E0D\u662F\u6700\u65B0\u72B6\u6001\u3002',
  queueTitle: '\u5171\u4EAB\u7A0D\u540E\u64AD\u653E',
  queueDesc: '\u961F\u5217\u4E2D\u7684\u6B4C\u4F1A\u4F18\u5148\u4F5C\u4E3A\u623F\u95F4\u4E0B\u4E00\u9996\u64AD\u653E\u5185\u5BB9\u3002\u961F\u5217\u4E3A\u7A7A\u65F6\uFF0C\u7EE7\u7EED\u6309\u539F\u6765\u7684\u64AD\u653E\u903B\u8F91\u8D70\u3002',
  queueEmpty: '\u6682\u65F6\u8FD8\u6CA1\u6709\u4EBA\u628A\u6B4C\u52A0\u5230\u5171\u4EAB\u961F\u5217',
  addCurrentSong: '\u5C06\u5F53\u524D\u6B4C\u66F2\u52A0\u5165\u961F\u5217',
  addingSong: '\u6DFB\u52A0\u4E2D...',
  songAdded: '\u5DF2\u52A0\u5165\u5171\u4EAB\u961F\u5217',
  removeSong: '\u5220\u9664',
  removingSong: '\u5220\u9664\u4E2D...',
  songRemoved: '\u5DF2\u4ECE\u5171\u4EAB\u961F\u5217\u79FB\u9664',
  noCurrentSong: '\u5F53\u524D\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u6B4C\u66F2',
  queueOrder: '\u961F\u5217',
  nowPlaying: '\u6B63\u5728\u64AD\u653E',
  addedBy: '\u6DFB\u52A0\u8005',
} as const

const formatRoomCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)

const ActionButton = ({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string
  onPress: () => void | Promise<void>
  disabled?: boolean
  primary?: boolean
}) => {
  const theme = useTheme()
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      style={{
        ...styles.actionBtn,
        opacity: disabled ? 0.45 : 1,
        backgroundColor: primary ? theme['c-button-background-selected'] : theme['c-primary-light-400-alpha-700'],
      }}
      onPress={() => {
        void onPress()
      }}
    >
      <Text
        size={13}
        color={primary ? theme['c-primary-light-1000'] : theme['c-font']}
        style={styles.actionBtnText}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const InfoTag = ({ label }: { label: string }) => {
  const theme = useTheme()
  return (
    <View style={{ ...styles.infoTag, backgroundColor: theme['c-primary-light-300-alpha-800'] }}>
      <Text size={11} color={theme['c-primary']}>{label}</Text>
    </View>
  )
}

export default ({ buttonSize, iconSize }: { buttonSize: number, iconSize: number }) => {
  const theme = useTheme()
  const room = usePartyRoom()
  const playMusicInfo = usePlayMusicInfo()
  const syncStatus = useSyncStatus()
  const dialogRef = useRef<DialogType>(null)
  const [roomName, setRoomName] = useState('')
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [password, setPassword] = useState('')
  const [loadingAction, setLoadingAction] = useState<string>('')

  const onlineCount = useMemo(() => room?.members.filter(member => member.isOnline).length ?? 0, [room])
  const isHost = useMemo(() => getPartySelfMember(room)?.isHost === true, [room])
  const queue = useMemo(() => getPartyQueue(room), [room])
  const currentPlayableMusic = playMusicInfo.musicInfo && !('progress' in playMusicInfo.musicInfo)
    ? playMusicInfo.musicInfo
    : playMusicInfo.musicInfo ? playMusicInfo.musicInfo.metadata.musicInfo : null
  const currentQueueIndex = room?.playback.currentIndex ?? -1

  const openDialog = () => {
    if (syncStatus.status) void ensurePartyRoomLoaded()
    dialogRef.current?.setVisible(true)
  }

  const closeDialog = () => {
    dialogRef.current?.setVisible(false)
  }

  const handleCreate = async() => {
    if (!syncStatus.status) {
      toast(syncStatus.message || TEXT.syncRequired)
      return
    }
    setLoadingAction('create')
    try {
      await createPartyRoom({
        name: roomName.trim() || undefined,
        roomCode: roomCode.trim() || undefined,
        password: password.trim() || undefined,
        displayName: nickname.trim() || undefined,
      })
      toast(TEXT.roomCreated)
      closeDialog()
    } catch (error) {
      toast(getPartyErrorMessage(error))
    } finally {
      setLoadingAction('')
    }
  }

  const handleJoin = async() => {
    if (!syncStatus.status) {
      toast(syncStatus.message || TEXT.syncRequired)
      return
    }
    if (!roomCode.trim()) {
      toast(TEXT.roomCodeRequired)
      return
    }
    setLoadingAction('join')
    try {
      await joinPartyRoom({
        roomCode: roomCode.trim(),
        password: password.trim() || undefined,
        displayName: nickname.trim() || undefined,
      })
      toast(TEXT.roomJoined)
      closeDialog()
    } catch (error) {
      toast(getPartyErrorMessage(error))
    } finally {
      setLoadingAction('')
    }
  }

  const handleLeave = async() => {
    const confirmed = await confirmDialog({
      title: TEXT.leaveTitle,
      message: TEXT.leaveMessage,
    })
    if (!confirmed) return

    setLoadingAction('leave')
    try {
      await leavePartyRoom()
      toast(TEXT.roomLeft)
      closeDialog()
    } catch (error) {
      toast(getPartyErrorMessage(error))
    } finally {
      setLoadingAction('')
    }
  }

  const handleAddCurrentSong = async() => {
    if (!currentPlayableMusic) {
      toast(TEXT.noCurrentSong)
      return
    }
    setLoadingAction('addSong')
    try {
      await appendPartyQueue([{ musicInfo: currentPlayableMusic }])
      toast(TEXT.songAdded)
    } catch (error) {
      toast(getPartyErrorMessage(error))
    } finally {
      setLoadingAction('')
    }
  }

  const handleRemoveQueueItem = async(id: string) => {
    setLoadingAction(`remove:${id}`)
    try {
      await removePartyQueueItems([id])
      toast(TEXT.songRemoved)
    } catch (error) {
      toast(getPartyErrorMessage(error))
    } finally {
      setLoadingAction('')
    }
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        style={{
          ...styles.launcher,
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: room ? theme['c-primary-light-400-alpha-700'] : 'transparent',
        }}
        onPress={openDialog}
      >
        <Icon
          name="share"
          size={iconSize}
          color={room ? theme['c-primary'] : theme['c-font-label']}
        />
        {room
          ? <View style={{ ...styles.onlineDot, backgroundColor: theme['c-button-background-selected'] }} />
          : null}
      </TouchableOpacity>

      <Dialog ref={dialogRef} title={room ? TEXT.roomPanelTitle : TEXT.panelTitle} height="72%">
        <ScrollView contentContainerStyle={styles.dialogContent}>
          {!room
            ? <>
                <View style={{ ...styles.heroCard, backgroundColor: theme['c-primary-light-300-alpha-800'] }}>
                  <View style={{ ...styles.heroIcon, backgroundColor: theme['c-primary-light-100-alpha-700'] }}>
                    <Icon name="share" size={22} color={theme['c-primary']} />
                  </View>
                  <View style={styles.heroText}>
                    <Text size={17} style={styles.heroTitle}>{TEXT.inviteTitle}</Text>
                    <Text size={12} color={theme['c-font-label']}>
                      {TEXT.inviteDesc}
                    </Text>
                  </View>
                </View>

                {!syncStatus.status
                  ? <View style={{ ...styles.noticeCard, backgroundColor: theme['c-primary-light-100-alpha-700'] }}>
                      <Text size={12} color={theme['c-font-label']}>
                        {syncStatus.message || TEXT.syncDesc}
                      </Text>
                    </View>
                  : null}

                <View style={styles.fieldGroup}>
                  <Text size={12} color={theme['c-font-label']} style={styles.fieldLabel}>{TEXT.nickname}</Text>
                  <View style={{ ...styles.inputWrap, backgroundColor: theme['c-primary-input-background'] }}>
                    <Input
                      value={nickname}
                      onChangeText={setNickname}
                      placeholder={TEXT.nicknamePlaceholder}
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text size={12} color={theme['c-font-label']} style={styles.fieldLabel}>{TEXT.roomName}</Text>
                  <View style={{ ...styles.inputWrap, backgroundColor: theme['c-primary-input-background'] }}>
                    <Input
                      value={roomName}
                      onChangeText={setRoomName}
                      placeholder={TEXT.roomNamePlaceholder}
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text size={12} color={theme['c-font-label']} style={styles.fieldLabel}>{TEXT.roomCode}</Text>
                  <View style={{ ...styles.inputWrap, backgroundColor: theme['c-primary-input-background'] }}>
                    <Input
                      value={roomCode}
                      onChangeText={value => { setRoomCode(formatRoomCode(value)) }}
                      placeholder={TEXT.roomCodePlaceholder}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text size={12} color={theme['c-font-label']} style={styles.fieldLabel}>{TEXT.password}</Text>
                  <View style={{ ...styles.inputWrap, backgroundColor: theme['c-primary-input-background'] }}>
                    <Input
                      value={password}
                      onChangeText={setPassword}
                      placeholder={TEXT.passwordPlaceholder}
                      secureTextEntry
                    />
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <ActionButton
                    label={loadingAction === 'create' ? TEXT.creating : TEXT.createRoom}
                    onPress={handleCreate}
                    primary
                    disabled={!!loadingAction}
                  />
                  <ActionButton
                    label={loadingAction === 'join' ? TEXT.joining : TEXT.joinRoom}
                    onPress={handleJoin}
                    disabled={!!loadingAction}
                  />
                </View>
              </>
            : <>
                <View style={{ ...styles.roomCard, backgroundColor: theme['c-primary-light-300-alpha-800'] }}>
                  <View style={styles.roomCardTop}>
                    <View style={styles.roomTitleWrap}>
                      <Text size={18} style={styles.roomTitle}>{room.name || TEXT.roomPanelTitle}</Text>
                      <Text size={12} color={theme['c-font-label']}>{TEXT.inviteTip}</Text>
                    </View>
                    <View style={{ ...styles.roomSignal, backgroundColor: theme['c-primary-light-100-alpha-700'] }}>
                      <Icon name="share" size={18} color={theme['c-primary']} />
                    </View>
                  </View>

                  <Text size={28} color={theme['c-primary']} style={styles.roomCode}>{room.roomCode}</Text>

                  <View style={styles.tagsRow}>
                    <InfoTag label={`${onlineCount}/${room.members.length} ${TEXT.online}`} />
                    <InfoTag label={room.settings.controlMode === 'all' ? TEXT.allControl : TEXT.hostControl} />
                    {isHost ? <InfoTag label={TEXT.youAreHost} /> : null}
                  </View>
                </View>

                {!syncStatus.status
                  ? <View style={{ ...styles.noticeCard, backgroundColor: theme['c-primary-light-100-alpha-700'] }}>
                      <Text size={12} color={theme['c-font-label']}>
                        {syncStatus.message || TEXT.disconnected}
                      </Text>
                    </View>
                  : null}

                <View style={{ ...styles.sectionCard, backgroundColor: theme['c-primary-light-300-alpha-800'] }}>
                  <Text size={12} color={theme['c-font-label']}>{TEXT.currentSong}</Text>
                  <Text size={15} style={styles.songTitle}>
                    {room.playback.currentMusic?.name ?? TEXT.waitingSong}
                  </Text>
                  <Text size={12} color={theme['c-font-label']}>
                    {room.playback.currentMusic?.singer ?? TEXT.currentSongDesc}
                  </Text>
                </View>

                <View style={{ ...styles.sectionCard, backgroundColor: theme['c-primary-light-300-alpha-800'] }}>
                  <View style={styles.queueHeader}>
                    <View style={styles.queueHeaderText}>
                      <Text size={12} color={theme['c-font-label']}>{TEXT.queueTitle}</Text>
                      <Text size={12} color={theme['c-font-label']}>{TEXT.queueDesc}</Text>
                    </View>
                    <ActionButton
                      label={loadingAction === 'addSong' ? TEXT.addingSong : TEXT.addCurrentSong}
                      onPress={handleAddCurrentSong}
                      disabled={!syncStatus.status || !!loadingAction}
                    />
                  </View>

                  {!queue.length
                    ? <Text size={12} color={theme['c-font-label']}>{TEXT.queueEmpty}</Text>
                    : <View style={styles.queueList}>
                        {queue.map((item, index) => {
                          const isCurrentQueueItem =
                            currentQueueIndex === index ||
                            (
                              currentQueueIndex < 0 &&
                              room.playback.currentMusic?.id === item.musicInfo.id &&
                              room.playback.currentMusic?.source === item.musicInfo.source
                            )
                          return (
                            <View
                              key={item.id}
                              style={{
                                ...styles.queueItem,
                                backgroundColor: isCurrentQueueItem
                                  ? theme['c-primary-light-100-alpha-700']
                                  : theme['c-primary-light-400-alpha-700'],
                              }}
                            >
                              <View style={styles.queueOrderWrap}>
                                <Text size={12} color={theme['c-font-label']}>{`${TEXT.queueOrder} ${index + 1}`}</Text>
                                {isCurrentQueueItem
                                  ? <Text size={11} color={theme['c-primary']}>{TEXT.nowPlaying}</Text>
                                  : null}
                              </View>
                              <Text size={14} style={styles.songTitle} numberOfLines={1}>{item.musicInfo.name}</Text>
                              <Text size={12} color={theme['c-font-label']} numberOfLines={1}>
                                {item.musicInfo.singer}
                              </Text>
                              <Text size={11} color={theme['c-font-label']} numberOfLines={1}>
                                {`${TEXT.addedBy}：${item.requestedBy.displayName ?? item.requestedBy.userName ?? item.requestedBy.deviceName}`}
                              </Text>
                              <TouchableOpacity
                                activeOpacity={0.8}
                                disabled={!!loadingAction}
                                style={{
                                  ...styles.queueRemoveBtn,
                                  opacity: loadingAction === `remove:${item.id}` ? 0.6 : 1,
                                  backgroundColor: theme['c-primary-light-300-alpha-800'],
                                }}
                                onPress={() => {
                                  void handleRemoveQueueItem(item.id)
                                }}
                              >
                                <Text size={12} color={theme['c-font']}>
                                  {loadingAction === `remove:${item.id}` ? TEXT.removingSong : TEXT.removeSong}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )
                        })}
                      </View>}
                </View>

                <View style={{ ...styles.sectionCard, backgroundColor: theme['c-primary-light-300-alpha-800'] }}>
                  <Text size={12} color={theme['c-font-label']} style={styles.sectionLabel}>{TEXT.members}</Text>
                  <View style={styles.memberList}>
                    {room.members.map(member => (
                      <View
                        key={member.clientId}
                        style={{
                          ...styles.memberChip,
                          backgroundColor: member.isOnline ? theme['c-primary-light-100-alpha-700'] : theme['c-primary-light-400-alpha-700'],
                        }}
                      >
                        <Text size={11}>
                          {member.displayName || member.userName || member.deviceName}
                          {member.isHost ? ` / ${TEXT.host}` : ''}
                          {!member.isOnline ? ` / ${TEXT.offline}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <ActionButton
                    label={TEXT.copyRoomCode}
                    onPress={copyPartyRoomCode}
                  />
                  <ActionButton
                    label={loadingAction === 'leave' ? TEXT.leaving : TEXT.leaveRoom}
                    onPress={handleLeave}
                    primary
                    disabled={!!loadingAction || !syncStatus.status}
                  />
                </View>
              </>
          }
        </ScrollView>
      </Dialog>
    </>
  )
}

const styles = createStyle({
  launcher: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 1,
    textShadowRadius: 1,
  },
  onlineDot: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 8,
    height: 8,
    borderRadius: 8,
  },
  dialogContent: {
    padding: 16,
    gap: 12,
  },
  heroCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  noticeCard: {
    borderRadius: 12,
    padding: 12,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    paddingLeft: 2,
  },
  inputWrap: {
    borderRadius: 12,
    paddingLeft: 8,
    paddingRight: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 12,
  },
  actionBtnText: {
    fontWeight: '600',
  },
  roomCard: {
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  roomCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomTitleWrap: {
    flex: 1,
  },
  roomTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  roomSignal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomCode: {
    fontWeight: '700',
    letterSpacing: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoTag: {
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 5,
    paddingBottom: 5,
  },
  sectionCard: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  queueHeader: {
    gap: 10,
  },
  queueHeaderText: {
    gap: 4,
  },
  queueList: {
    gap: 8,
  },
  queueItem: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  queueOrderWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  queueRemoveBtn: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 5,
    paddingBottom: 5,
    marginTop: 4,
  },
  sectionLabel: {
    marginBottom: 2,
  },
  songTitle: {
    fontWeight: '600',
  },
  memberList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberChip: {
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
})
