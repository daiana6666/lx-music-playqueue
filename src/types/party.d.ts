declare global {
  namespace LX {
    namespace Party {
      type RoomControlMode = 'host' | 'all'

      interface OperatorInfo {
        clientId: string
        userName: string
        deviceName: string
        displayName: string
      }

      interface Member {
        clientId: string
        userName: string
        deviceName: string
        displayName: string
        isHost: boolean
        isOnline: boolean
        isReady: boolean
        isLoading: boolean
        joinedAt: number
        lastSeenAt: number
      }

      interface QueueItem {
        id: string
        musicInfo: LX.Music.MusicInfo
        addedAt: number
        requestedBy: OperatorInfo
      }

      interface QueueItemInput {
        id?: string
        musicInfo: LX.Music.MusicInfo
      }

      interface PlaybackState {
        currentMusic: LX.Music.MusicInfo | null
        currentIndex: number
        queue: QueueItem[]
        playing: boolean
        progress: number
        progressAt: number
        duration: number | null
        rate: number
        version: number
        updatedAt: number
        operator: OperatorInfo | null
      }

      interface RoomSettings {
        controlMode: RoomControlMode
        maxMembers: number
        hasPassword?: boolean
        [key: string]: unknown
      }

      interface RoomSnapshot {
        roomId: string
        roomCode: string
        name: string
        ownerClientId: string
        members: Member[]
        settings: RoomSettings
        playback: PlaybackState
        createdAt: number
        updatedAt: number
      }

      interface RoomSummary {
        roomId: string
        roomCode: string
        name: string
        ownerClientId: string
        ownerName: string
        memberCount: number
        onlineCount: number
        maxMembers: number
        hasPassword: boolean
        controlMode: RoomControlMode
        currentMusic: LX.Music.MusicInfo | null
        playing: boolean
      }

      type SyncReason =
        | 'initial_sync'
        | 'room_created'
        | 'room_joined'
        | 'room_left'
        | 'room_dismissed'
        | 'room_updated'
        | 'owner_transferred'
        | 'member_updated'
        | 'member_removed'
        | 'member_online'
        | 'member_offline'
        | 'playback_updated'
        | 'queue_updated'
        | 'heartbeat'

      interface SyncAction {
        action: 'party_room_state'
        data: {
          reason: SyncReason
          room: RoomSnapshot | null
        }
      }
    }
  }
}

export {}
