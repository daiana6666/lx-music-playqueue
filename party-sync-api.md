# Party 一起听模块接入文档

本文档说明 `party` 一起听模块的功能、接口、请求参数、返回结构和典型调用方式，方便在音乐 App 中直接接入。

## 1. 功能概览

`party` 模块是基于当前项目现有 WebSocket 同步机制扩展出来的“服务端权威状态”模块。

它负责同步以下能力：

- 创建房间
- 通过房间号加入房间
- 房间密码验证
- 房主主控 / 全员可控
- 成员在线状态
- 成员昵称、ready、loading 状态
- 当前播放歌曲
- 播放 / 暂停状态
- 播放进度
- 播放速率
- 当前播放队列
- 房主转移
- 移除成员
- 断线重连恢复
- 服务端主动广播最新房间快照

当前实现的核心原则：

- 服务端是房间状态的唯一权威来源
- App 通过 RPC 调用提交操作
- 服务端通过回调接口把最新房间快照推给 App
- App 端建议始终以服务端回推的 `RoomSnapshot` 覆盖本地房间状态


## 2. 接入方式

和现有 `list / dislike` 模块一样，`party` 也是一组 `message2call` 风格的接口。

接入时分为两部分：

1. App 主动调用服务端接口
2. App 实现服务端反调接口


## 3. 功能协商

App 在 `getEnabledFeatures()` 中声明支持 `party`：

```ts
async function getEnabledFeatures(serverType, supportedFeatures) {
  return {
    list: supportedFeatures.list ? { skipSnapshot: false } : false,
    dislike: supportedFeatures.dislike ? { skipSnapshot: false } : false,
    party: supportedFeatures.party ? {} : false,
  }
}
```

说明：

- `party` 当前没有额外功能参数，因此启用时传空对象 `{}` 即可
- 如果不支持一起听，返回 `false`


## 4. 接口分类

### 4.1 App 主动调用服务端

这些接口由 App 调用，定义在：

- [src/types/sync_common.d.ts](/D:/projects/lx-music-sync-server/src/types/sync_common.d.ts)

对应方法前缀为：

- `party_*`

### 4.2 服务端主动回调 App

这些接口需要由 App 实现，服务端会主动调用：

- `onPartySyncAction`
- `party_sync_set_room_state`
- `party_sync_finished`


## 5. 核心数据结构

以下结构定义在：

- [src/types/party.d.ts](/D:/projects/lx-music-sync-server/src/types/party.d.ts)
- [src/types/party_sync.d.ts](/D:/projects/lx-music-sync-server/src/types/party_sync.d.ts)

### 5.1 RoomControlMode

```ts
type RoomControlMode = 'host' | 'all'
```

说明：

- `host`：只有房主能控制播放、队列和房间设置
- `all`：所有成员都可以控制播放和队列


### 5.2 OperatorInfo

```ts
interface OperatorInfo {
  clientId: string
  userName: string
  deviceName: string
  displayName: string
}
```

说明：

- 表示最近一次操作房间或播放状态的成员信息


### 5.3 Member

```ts
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
```

字段说明：

- `clientId`：设备唯一 id
- `userName`：当前服务端用户
- `deviceName`：设备名
- `displayName`：房间中显示昵称
- `isHost`：是否为房主
- `isOnline`：是否在线
- `isReady`：是否准备完成
- `isLoading`：是否处于加载中
- `joinedAt`：加入时间戳，毫秒
- `lastSeenAt`：最近在线时间戳，毫秒


### 5.4 QueueItem / QueueItemInput

```ts
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
```

说明：

- `QueueItemInput` 是 App 调服务端时传入的结构
- 如果没有传 `id`，服务端会自动生成队列项 id
- `QueueItem` 是服务端回推给客户端的完整结构


### 5.5 PlaybackState

```ts
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
```

字段说明：

- `currentMusic`：当前播放歌曲
- `currentIndex`：当前歌曲在 `queue` 中的位置，未选中时为 `-1`
- `queue`：当前播放队列
- `playing`：是否播放中
- `progress`：基准进度，单位毫秒
- `progressAt`：这个进度对应的服务端时间戳，单位毫秒
- `duration`：歌曲总时长，单位毫秒，可为 `null`
- `rate`：播放速度，例如 `1`
- `version`：播放状态版本号，每次更新递增
- `updatedAt`：最近一次更新的时间戳
- `operator`：最近一次更新播放状态的人

进度计算建议：

```ts
function getCurrentProgress(playback: PlaybackState) {
  if (!playback.playing) return playback.progress
  return playback.progress + (Date.now() - playback.progressAt) * playback.rate
}
```


### 5.6 RoomSnapshot

```ts
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
```

说明：

- 这是房间完整快照
- App 建议把它作为本地房间状态的唯一数据源


### 5.7 RoomSummary

```ts
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
```

说明：

- 用于加入前探测房间基本信息
- 不包含完整成员列表和完整队列


## 6. App 主动调用的接口

## 6.1 `party_room_resolve`

用途：

- 根据 `roomId` 或 `roomCode` 查询房间是否存在
- 获取加入前的房间摘要

调用签名：

```ts
party_room_resolve(input: {
  roomId?: string
  roomCode?: string
}): Promise<RoomSummary | null>
```

请求参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `roomId` | `string` | 否 | 房间 id |
| `roomCode` | `string` | 否 | 房间号 |

返回：

- 房间存在：返回 `RoomSummary`
- 房间不存在：返回 `null`

示例：

```ts
const room = await remoteQueueParty.party_room_resolve({ roomCode: 'AB12CD' })
```


## 6.2 `party_room_create`

用途：

- 创建一个新的房间

调用签名：

```ts
party_room_create(input: {
  name?: string
  roomCode?: string
  password?: string
  controlMode?: 'host' | 'all'
  maxMembers?: number
  displayName?: string
}): Promise<RoomSnapshot>
```

请求参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 否 | 房间名，默认自动生成 |
| `roomCode` | `string` | 否 | 自定义房间号，4 到 12 位，只允许大写字母和数字 |
| `password` | `string` | 否 | 房间密码 |
| `controlMode` | `'host' \| 'all'` | 否 | 控制模式，默认 `host` |
| `maxMembers` | `number` | 否 | 最大成员数，范围 2 到 32 |
| `displayName` | `string` | 否 | 当前成员在房间中的显示昵称 |

返回：

- 创建完成后的完整 `RoomSnapshot`

示例：

```ts
const room = await remoteQueueParty.party_room_create({
  name: '今晚一起听',
  controlMode: 'host',
  maxMembers: 8,
  password: '123456',
  displayName: '小明',
})
```


## 6.3 `party_room_join`

用途：

- 加入一个已存在的房间

调用签名：

```ts
party_room_join(input: {
  roomId?: string
  roomCode?: string
  password?: string
  displayName?: string
}): Promise<RoomSnapshot>
```

请求参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `roomId` | `string` | 否 | 房间 id |
| `roomCode` | `string` | 否 | 房间号 |
| `password` | `string` | 否 | 房间密码 |
| `displayName` | `string` | 否 | 当前成员在房间中的显示昵称 |

返回：

- 加入后的完整 `RoomSnapshot`

常见错误：

- `room not found`
- `invalid room password`
- `room is full`

示例：

```ts
const room = await remoteQueueParty.party_room_join({
  roomCode: 'AB12CD',
  password: '123456',
  displayName: '小红',
})
```


## 6.4 `party_room_leave`

用途：

- 当前成员主动退出房间

调用签名：

```ts
party_room_leave(): Promise<void>
```

返回：

- 无返回值

说明：

- 若退出者是房主且房间还有其他人，服务端会自动转移房主
- 当前客户端随后会收到 `room = null` 的回推


## 6.5 `party_room_dismiss`

用途：

- 房主解散房间

调用签名：

```ts
party_room_dismiss(): Promise<void>
```

返回：

- 无返回值

说明：

- 只有房主能调用
- 解散后所有成员会收到 `room = null`


## 6.6 `party_room_get_current`

用途：

- 获取当前客户端所在房间的完整快照

调用签名：

```ts
party_room_get_current(): Promise<RoomSnapshot | null>
```

返回：

- 在房间中：返回 `RoomSnapshot`
- 不在房间中：返回 `null`


## 6.7 `party_room_update`

用途：

- 修改房间设置

调用签名：

```ts
party_room_update(input: {
  name?: string
  password?: string | null
  controlMode?: 'host' | 'all'
  maxMembers?: number
}): Promise<RoomSnapshot>
```

请求参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 否 | 房间名称 |
| `password` | `string \| null` | 否 | 新密码；传 `null` 表示取消密码 |
| `controlMode` | `'host' \| 'all'` | 否 | 控制模式 |
| `maxMembers` | `number` | 否 | 最大成员数 |

返回：

- 更新后的 `RoomSnapshot`

说明：

- 只有房主能调用


## 6.8 `party_room_transfer_owner`

用途：

- 房主转移给指定成员

调用签名：

```ts
party_room_transfer_owner(targetClientId: string): Promise<RoomSnapshot>
```

请求参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `targetClientId` | `string` | 是 | 新房主的 `clientId` |

返回：

- 更新后的 `RoomSnapshot`

说明：

- 只有房主能调用


## 6.9 `party_member_update`

用途：

- 更新当前成员的房间状态

调用签名：

```ts
party_member_update(input: {
  displayName?: string
  isReady?: boolean
  isLoading?: boolean
}): Promise<RoomSnapshot>
```

请求参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `displayName` | `string` | 否 | 显示昵称 |
| `isReady` | `boolean` | 否 | 是否准备完成 |
| `isLoading` | `boolean` | 否 | 是否加载中 |

返回：

- 更新后的 `RoomSnapshot`

示例：

```ts
await remoteQueueParty.party_member_update({
  isLoading: true,
})
```


## 6.10 `party_member_remove`

用途：

- 房主移除指定成员

调用签名：

```ts
party_member_remove(targetClientId: string): Promise<RoomSnapshot>
```

请求参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `targetClientId` | `string` | 是 | 被移除成员的 `clientId` |

返回：

- 房间剩余成员视角下的最新 `RoomSnapshot`

说明：

- 被移除成员会收到 `room = null`
- 只有房主能调用


## 6.11 `party_playback_update`

用途：

- 同步当前播放状态
- 可用于切歌、播放、暂停、拖动进度、更新速率等

调用签名：

```ts
party_playback_update(input: {
  currentMusic?: LX.Music.MusicInfo | null
  currentIndex?: number
  playing?: boolean
  progress?: number
  progressAt?: number
  duration?: number | null
  rate?: number
  queue?: QueueItemInput[]
}): Promise<RoomSnapshot>
```

请求参数说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `currentMusic` | `MusicInfo \| null` | 否 | 当前播放歌曲 |
| `currentIndex` | `number` | 否 | 当前歌曲在队列中的索引 |
| `playing` | `boolean` | 否 | 是否播放中 |
| `progress` | `number` | 否 | 当前进度，单位毫秒 |
| `progressAt` | `number` | 否 | 上述进度对应的时间戳，单位毫秒 |
| `duration` | `number \| null` | 否 | 歌曲总时长，单位毫秒 |
| `rate` | `number` | 否 | 播放速率 |
| `queue` | `QueueItemInput[]` | 否 | 直接覆盖当前队列 |

返回：

- 更新后的 `RoomSnapshot`

说明：

- 若房间是 `host` 模式，只有房主可调用
- 若房间是 `all` 模式，所有成员可调用
- 推荐每次发播放状态时同时带上 `progress` 与 `progressAt`

示例：切歌并开始播放

```ts
await remoteQueueParty.party_playback_update({
  currentMusic: musicInfo,
  currentIndex: 0,
  playing: true,
  progress: 0,
  progressAt: Date.now(),
  duration: 235000,
  rate: 1,
})
```

示例：暂停

```ts
await remoteQueueParty.party_playback_update({
  playing: false,
  progress: currentProgressMs,
  progressAt: Date.now(),
})
```


## 6.12 `party_queue_set`

用途：

- 整体替换播放队列

调用签名：

```ts
party_queue_set(queue: QueueItemInput[]): Promise<RoomSnapshot>
```

返回：

- 更新后的 `RoomSnapshot`


## 6.13 `party_queue_append`

用途：

- 追加歌曲到队列末尾

调用签名：

```ts
party_queue_append(queue: QueueItemInput[]): Promise<RoomSnapshot>
```

返回：

- 更新后的 `RoomSnapshot`


## 6.14 `party_queue_remove`

用途：

- 删除队列中的若干项

调用签名：

```ts
party_queue_remove(ids: string[]): Promise<RoomSnapshot>
```

请求参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ids` | `string[]` | 是 | 要删除的队列项 id 列表 |

返回：

- 更新后的 `RoomSnapshot`


## 6.15 `party_queue_move`

用途：

- 调整某个队列项的位置

调用签名：

```ts
party_queue_move(input: {
  id: string
  position: number
}): Promise<RoomSnapshot>
```

请求参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `string` | 是 | 队列项 id |
| `position` | `number` | 是 | 目标位置，0 开始 |

返回：

- 更新后的 `RoomSnapshot`


## 6.16 `party_ping`

用途：

- 心跳保活
- 可选地附带成员状态更新

调用签名：

```ts
party_ping(input?: {
  displayName?: string
  isReady?: boolean
  isLoading?: boolean
}): Promise<RoomSnapshot | null>
```

返回：

- 当前还在房间中：返回 `RoomSnapshot`
- 当前不在房间中：返回 `null`

建议：

- 每 15 到 30 秒发一次
- 切歌加载期间可以顺便带上 `isLoading` / `isReady`


## 7. 服务端回调 App 的接口

这些接口由 App 实现，服务端会主动调用。

## 7.1 `onPartySyncAction`

用途：

- 服务端主动广播房间状态变化

调用签名：

```ts
onPartySyncAction(action: {
  action: 'party_room_state'
  data: {
    reason: SyncReason
    room: RoomSnapshot | null
  }
}): Promise<void>
```

其中 `reason` 取值：

```ts
'initial_sync'
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
```

说明：

- `room !== null`：表示房间仍存在
- `room === null`：表示当前客户端已不在房间中或房间已解散

推荐处理方式：

```ts
async function onPartySyncAction(action) {
  partyStore.setRoom(action.data.room)
}
```


## 7.2 `party_sync_set_room_state`

用途：

- 服务端在模块同步阶段推送当前房间状态

调用签名：

```ts
party_sync_set_room_state(room: RoomSnapshot | null): Promise<void>
```

说明：

- 通常用于首次连接或重连后恢复当前房间状态


## 7.3 `party_sync_finished`

用途：

- 服务端通知当前 `party` 模块同步阶段完成

调用签名：

```ts
party_sync_finished(): Promise<void>
```


## 8. 典型调用流程

## 8.1 创建房间

```ts
const room = await remoteQueueParty.party_room_create({
  name: '今晚一起听',
  controlMode: 'host',
  maxMembers: 8,
  password: '123456',
  displayName: '小明',
})
```

之后：

- App 保存 `room`
- 开启 `party_ping()` 心跳
- 播放器操作时调用 `party_playback_update()`


## 8.2 加入房间

```ts
const roomInfo = await remoteQueueParty.party_room_resolve({ roomCode: 'AB12CD' })
if (!roomInfo) throw new Error('房间不存在')

const room = await remoteQueueParty.party_room_join({
  roomCode: 'AB12CD',
  password: '123456',
  displayName: '小红',
})
```


## 8.3 切歌

```ts
await remoteQueueParty.party_playback_update({
  currentMusic: musicInfo,
  currentIndex: 0,
  playing: true,
  progress: 0,
  progressAt: Date.now(),
  duration: 235000,
  rate: 1,
})
```


## 8.4 暂停 / 恢复

```ts
await remoteQueueParty.party_playback_update({
  playing: false,
  progress: currentProgressMs,
  progressAt: Date.now(),
})

await remoteQueueParty.party_playback_update({
  playing: true,
  progress: currentProgressMs,
  progressAt: Date.now(),
})
```


## 8.5 拖动进度

```ts
await remoteQueueParty.party_playback_update({
  progress: seekProgressMs,
  progressAt: Date.now(),
})
```


## 8.6 队列操作

```ts
await remoteQueueParty.party_queue_set([
  { musicInfo: musicA },
  { musicInfo: musicB },
])

await remoteQueueParty.party_queue_append([
  { musicInfo: musicC },
])

await remoteQueueParty.party_queue_move({
  id: queueItemId,
  position: 0,
})

await remoteQueueParty.party_queue_remove([queueItemId])
```


## 8.7 成员状态同步

```ts
await remoteQueueParty.party_member_update({
  isLoading: true,
})

await remoteQueueParty.party_member_update({
  isLoading: false,
  isReady: true,
})
```


## 9. 推荐的 App 端状态处理方式

建议 App 内部维护一个 `partyStore`：

```ts
const partyStore = {
  room: null as LX.Party.RoomSnapshot | null,

  setRoom(room: LX.Party.RoomSnapshot | null) {
    this.room = room
    renderPartyUI(room)
  },
}
```

推荐约定：

- `party_sync_set_room_state(room)`：直接覆盖本地 `room`
- `onPartySyncAction(action)`：同样直接覆盖本地 `room`
- 不要自己做复杂增量合并
- 播放器控制按钮的权限判断依据：
  - `room.settings.controlMode === 'all'`
  - 或者 `room.members.find(m => m.clientId === selfClientId)?.isHost === true`


## 10. 错误处理建议

服务端当前主要通过抛错返回失败，App 端建议统一捕获并做用户提示。

常见错误字符串：

- `room not found`
- `invalid room password`
- `room is full`
- `member is not in any room`
- `only host can do this operation`
- `target member not found`
- `host can not remove itself`
- `currentIndex out of range`
- `queue item not found`
- `maxMembers can not be smaller than current member count`
- `roomCode must be 4-12 chars of A-Z or 0-9`
- `roomCode already exists`


## 11. 当前实现的注意事项

- 当前房间状态保存在服务端内存中，没有落盘
- 当房间全部成员离线超过一段时间后，房间会自动释放
- 当前推荐心跳频率为 15 到 30 秒
- 进度单位统一建议使用毫秒
- `currentIndex` 建议与 `queue` 保持一致
- 如果切歌时只更新了 `currentMusic`，建议同时更新 `currentIndex / progress / progressAt / duration`


## 12. 相关源码位置

- 类型定义：
  - [src/types/party.d.ts](/D:/projects/lx-music-sync-server/src/types/party.d.ts)
  - [src/types/party_sync.d.ts](/D:/projects/lx-music-sync-server/src/types/party_sync.d.ts)
  - [src/types/sync_common.d.ts](/D:/projects/lx-music-sync-server/src/types/sync_common.d.ts)

- 服务端实现：
  - [src/modules/party/manage.ts](/D:/projects/lx-music-sync-server/src/modules/party/manage.ts)
  - [src/modules/party/event.ts](/D:/projects/lx-music-sync-server/src/modules/party/event.ts)
  - [src/modules/party/sync/handler.ts](/D:/projects/lx-music-sync-server/src/modules/party/sync/handler.ts)
  - [src/modules/party/sync/sync.ts](/D:/projects/lx-music-sync-server/src/modules/party/sync/sync.ts)

