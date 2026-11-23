# Desktop Feature Mobile Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the customized desktop recommendation, WY account, playback, favorites, recent play, listening-time, settings, WebDAV/party-adjacent, and mobile-equivalent UI features into `lx-music-mobile`.

**Architecture:** Implement a mobile-native WY service in `src/core/netease` using the app's existing React Native request and WY crypto helpers, not the desktop Node enhanced API. Add small tested pure helpers first, then wire stores, playlist detail, playback fallback, navigation, recommendation UI, and settings around existing mobile patterns.

**Tech Stack:** React Native 0.73, TypeScript/JavaScript, `react-native-navigation`, `react-native-pager-view`, existing storage helpers, existing WY `weapi/eapi/linuxapi` helpers, Node built-in `node:test` for pure utility tests.

---

## File Structure

Create:

- `test/core/netease/helpers.test.cjs` - pure helper tests for IDs, section order, recent play, listening time, and WY normalization behavior.
- `src/core/netease/helpers.js` - framework-neutral helper functions imported by tests and production code.
- `src/core/netease/index.ts` - mobile WY service API.
- `src/core/netease/types.d.ts` - `LX.Netease` declarations.
- `src/store/netease/state.ts`, `src/store/netease/action.ts`, `src/store/netease/hook.ts` - account state.
- `src/store/recommend/state.ts`, `src/store/recommend/action.ts`, `src/store/recommend/hook.ts` - recommendation home cache/state.
- `src/store/dailyRecommend/state.ts`, `src/store/dailyRecommend/action.ts` - daily recommendation virtual playlist.
- `src/store/privateFm/state.ts`, `src/store/privateFm/action.ts`, `src/store/privateFm/hook.ts` - private FM playback mode.
- `src/store/recentPlay/state.ts`, `src/store/recentPlay/action.ts`, `src/store/recentPlay/hook.ts` - recent play list.
- `src/store/listeningTime/state.ts`, `src/store/listeningTime/action.ts`, `src/store/listeningTime/hook.ts` - listening time stats.
- `src/screens/Home/Views/Recommend/index.tsx` - recommendation home screen.
- `src/screens/Home/Views/Recommend/components/AccountHeader.tsx`
- `src/screens/Home/Views/Recommend/components/LoginQrModal.tsx`
- `src/screens/Home/Views/Recommend/components/SpecialCards.tsx`
- `src/screens/Home/Views/Recommend/components/PlaylistRail.tsx`
- `src/screens/Home/Views/Recommend/components/SongSection.tsx`
- `src/screens/Home/Views/Recommend/components/ChartRail.tsx`
- `src/screens/Home/Views/Setting/settings/Recommend/index.tsx`
- `src/screens/Home/Views/Setting/settings/Recommend/SectionOrder.tsx`
- `src/screens/Home/Views/Setting/settings/Recommend/DailySongTags.tsx`
- `src/screens/Home/Views/Setting/settings/ListeningTime.tsx`
- `src/components/player/PlayQueueModal.tsx`

Modify:

- `package.json` - add a pure test script.
- `src/config/constant.ts` - storage keys and `nav_recommend`.
- `src/config/defaultSetting.ts` - recommendation/list scale defaults.
- `src/config/migrateSetting.ts` - setting migration defaults.
- `src/types/app_setting.d.ts`, `src/types/music.d.ts`, `src/types/list.d.ts` - new settings and metadata.
- `src/utils/data.ts` - persisted WY account, recent play, listening time helpers.
- `src/core/init/dataInit.ts` - initialize account, recent play, listening time, optional recommend warm-up.
- `src/core/songlist.ts` - WY and virtual playlist detail branches.
- `src/screens/SonglistDetail/listAction.ts` - play/collect WY details through the new branch.
- `src/core/player/player.ts` - WY playback fallback and private FM/recent/listening hooks.
- `src/core/player/playInfo.ts` - keep `source:id` identity behavior for WY virtual lists.
- `src/core/list.ts` and/or `src/event/listEvent.ts` - liked-list WY sync after local add.
- `src/screens/Home/Vertical/Main.tsx`, `src/screens/Home/Vertical/BottomNav.tsx`, `src/screens/Home/Vertical/DrawerNav.tsx`, `src/screens/Home/Horizontal/Aside.tsx` - add recommendation nav.
- `src/screens/Home/Views/Setting/Main.tsx` and setting nav files - add recommendation/listening-time settings.
- `src/lang/zh-cn.json`, `src/lang/zh-tw.json`, `src/lang/en-us.json` - text.
- `README.md` - mobile feature summary.

## Task 1: Pure Helper Test Harness

**Files:**
- Create: `test/core/netease/helpers.test.cjs`
- Create: `src/core/netease/helpers.js`
- Modify: `package.json`

- [ ] **Step 1: Add the failing test file**

Create `test/core/netease/helpers.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getDailySongCategoryTagKey,
  parseDailySongCategoryTagKey,
  getDailySongCategoryPlaylistId,
  parseDailySongCategoryPlaylistId,
  normalizeRecommendHomeSectionOrder,
  moveRecommendHomeSection,
  createRecentPlayList,
  createDefaultListeningTimeStats,
  addListeningTime,
  normalizeNeteaseSong,
} = require('../../../src/core/netease/helpers.js')

test('daily song category tag and playlist IDs round trip', () => {
  assert.equal(getDailySongCategoryTagKey('10', '20'), '10:20')
  assert.deepEqual(parseDailySongCategoryTagKey('10:20'), { categoryId: '10', tagId: '20' })
  assert.equal(getDailySongCategoryPlaylistId('10', '20'), 'daily_song_category__10__20')
  assert.deepEqual(parseDailySongCategoryPlaylistId('daily_song_category__10__20'), { categoryId: '10', tagId: '20' })
  assert.equal(parseDailySongCategoryPlaylistId('normal__10__20'), null)
})

test('recommend home section order is normalized and movable', () => {
  const defaultOrder = ['radarPlaylists', 'styleSongs', 'dailySongCategories', 'similarSongs', 'recommendPlaylists', 'charts']
  assert.deepEqual(normalizeRecommendHomeSectionOrder(['charts', 'unknown', 'charts', 'styleSongs']), [
    'charts',
    'styleSongs',
    'radarPlaylists',
    'dailySongCategories',
    'similarSongs',
    'recommendPlaylists',
  ])
  assert.deepEqual(moveRecommendHomeSection(defaultOrder, 'styleSongs', -1), [
    'styleSongs',
    'radarPlaylists',
    'dailySongCategories',
    'similarSongs',
    'recommendPlaylists',
    'charts',
  ])
  assert.deepEqual(moveRecommendHomeSection(defaultOrder, 'radarPlaylists', -1), defaultOrder)
})

test('recent play de-duplicates by source identity and caps length', () => {
  const a = { id: '1', source: 'wy', name: 'A', singer: 'S' }
  const b = { id: '1', source: 'kw', name: 'A', singer: 'S' }
  const next = createRecentPlayList([a, b], a, 2)
  assert.deepEqual(next.map(item => `${item.source}:${item.id}`), ['wy:1', 'kw:1'])
  const capped = createRecentPlayList([a, b], { id: '2', source: 'kg', name: 'C', singer: 'D' }, 2)
  assert.deepEqual(capped.map(item => `${item.source}:${item.id}`), ['kg:2', 'wy:1'])
})

test('listening time accumulates total daily and song stats', () => {
  const stats = createDefaultListeningTimeStats()
  addListeningTime(stats, 65, { id: '1', source: 'wy', name: 'A', singer: 'S' }, new Date('2026-05-31T09:00:00+08:00'))
  addListeningTime(stats, 5, { id: '1', source: 'wy', name: 'A2', singer: 'S2' }, new Date('2026-05-31T09:01:00+08:00'))
  assert.equal(stats.totalSeconds, 70)
  assert.equal(stats.daily['2026-05-31'], 70)
  assert.equal(stats.songs['wy:1'].seconds, 70)
  assert.equal(stats.songs['wy:1'].name, 'A2')
})

test('WY song normalization creates LX online music info', () => {
  const song = {
    id: 123,
    name: 'Song',
    dt: 245000,
    ar: [{ name: 'Singer A' }, { name: 'Singer B' }],
    al: { id: 456, name: 'Album', picUrl: 'https://img.example/a.jpg' },
    h: { size: 1000 },
    l: { size: 500 },
  }
  const privilege = { maxbr: 320000 }
  assert.deepEqual(normalizeNeteaseSong(song, privilege), {
    id: 'wy_123',
    name: 'Song',
    singer: 'Singer A、Singer B',
    source: 'wy',
    interval: '04:05',
    meta: {
      songId: 123,
      albumName: 'Album',
      albumId: 456,
      picUrl: 'https://img.example/a.jpg',
      qualitys: [{ type: '128k', size: '500.00B' }, { type: '320k', size: '1000.00B' }],
      _qualitys: { '128k': { size: '500.00B' }, '320k': { size: '1000.00B' } },
    },
  })
})
```

- [ ] **Step 2: Add the missing helper module stub**

Create `src/core/netease/helpers.js`:

```js
module.exports = {}
```

- [ ] **Step 3: Add the test script**

Modify `package.json` scripts:

```json
"test:logic": "node --test test/**/*.test.cjs"
```

- [ ] **Step 4: Run the test and verify it fails**

Run: `npm run test:logic`

Expected: FAIL with messages like `getDailySongCategoryTagKey is not a function`.

- [ ] **Step 5: Commit the red test harness**

```bash
git add package.json test/core/netease/helpers.test.cjs src/core/netease/helpers.js
git commit -m "test: add mobile port helper tests"
```

## Task 2: Implement Pure Helpers

**Files:**
- Modify: `src/core/netease/helpers.js`

- [ ] **Step 1: Implement helper functions**

Replace `src/core/netease/helpers.js` with:

```js
const DAILY_SONG_CATEGORY_TAG_KEY_SEPARATOR = ':'
const DAILY_SONG_CATEGORY_PLAYLIST_ID_PREFIX = 'daily_song_category'

const RECOMMEND_HOME_SECTION_IDS = [
  'radarPlaylists',
  'styleSongs',
  'dailySongCategories',
  'similarSongs',
  'recommendPlaylists',
  'charts',
]

const getDailySongCategoryTagKey = (categoryId, tagId) => {
  return `${categoryId}${DAILY_SONG_CATEGORY_TAG_KEY_SEPARATOR}${tagId}`
}

const parseDailySongCategoryTagKey = (key) => {
  const [categoryId, tagId] = String(key).split(DAILY_SONG_CATEGORY_TAG_KEY_SEPARATOR)
  if (!categoryId || !tagId) return null
  return { categoryId, tagId }
}

const getDailySongCategoryPlaylistId = (categoryId, tagId) => {
  return `${DAILY_SONG_CATEGORY_PLAYLIST_ID_PREFIX}__${categoryId}__${tagId}`
}

const parseDailySongCategoryPlaylistId = (id) => {
  const [prefix, categoryId, tagId] = String(id).split('__')
  if (prefix != DAILY_SONG_CATEGORY_PLAYLIST_ID_PREFIX || !categoryId || !tagId) return null
  return { categoryId, tagId }
}

const normalizeRecommendHomeSectionOrder = (rawOrder) => {
  const seen = new Set()
  const order = []
  if (Array.isArray(rawOrder)) {
    for (const item of rawOrder) {
      if (!RECOMMEND_HOME_SECTION_IDS.includes(item) || seen.has(item)) continue
      seen.add(item)
      order.push(item)
    }
  }
  for (const item of RECOMMEND_HOME_SECTION_IDS) {
    if (seen.has(item)) continue
    order.push(item)
  }
  return order
}

const moveRecommendHomeSection = (rawOrder, section, direction) => {
  const order = normalizeRecommendHomeSectionOrder(rawOrder)
  const index = order.indexOf(section)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= order.length) return order
  const target = order[targetIndex]
  order[targetIndex] = order[index]
  order[index] = target
  return order
}

const createMusicIdentity = (musicInfo) => `${musicInfo.source}:${musicInfo.id}`

const createRecentPlayList = (list, musicInfo, limit = 520) => {
  const targetIdentity = createMusicIdentity(musicInfo)
  return [
    musicInfo,
    ...list.filter(item => createMusicIdentity(item) != targetIdentity),
  ].slice(0, limit)
}

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const createDefaultListeningTimeStats = () => ({
  totalSeconds: 0,
  daily: {},
  songs: {},
  updatedAt: Date.now(),
})

const normalizeListeningTimeStats = (stats) => {
  const nextStats = createDefaultListeningTimeStats()
  if (!stats) return nextStats
  nextStats.totalSeconds = Math.max(0, Math.floor(Number(stats.totalSeconds) || 0))
  nextStats.daily = { ...(stats.daily ?? {}) }
  nextStats.songs = { ...(stats.songs ?? {}) }
  nextStats.updatedAt = Number(stats.updatedAt) || Date.now()
  return nextStats
}

const addListeningTime = (stats, seconds, song, date = new Date()) => {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  if (!safeSeconds) return stats
  const dayKey = getLocalDateKey(date)
  stats.totalSeconds += safeSeconds
  stats.daily[dayKey] = (stats.daily[dayKey] ?? 0) + safeSeconds
  stats.updatedAt = Date.now()
  if (song?.id) {
    const songKey = `${song.source ?? 'unknown'}:${song.id}`
    const songStat = stats.songs[songKey] ?? {
      id: song.id,
      name: song.name,
      singer: song.singer,
      source: song.source,
      seconds: 0,
    }
    songStat.name = song.name
    songStat.singer = song.singer
    songStat.source = song.source
    songStat.seconds += safeSeconds
    stats.songs[songKey] = songStat
  }
  return stats
}

const formatPlayTime = (seconds) => {
  const time = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(time / 60)
  const s = time % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const sizeFormate = (size) => {
  const value = Number(size) || 0
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)}GB`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`
  if (value >= 1024) return `${(value / 1024).toFixed(2)}KB`
  return `${value.toFixed(2)}B`
}

const getSinger = (singers) => singers?.map(s => s.name).filter(Boolean).join('、') ?? ''

const pushQuality = (qualitys, _qualitys, type, size) => {
  const formattedSize = size ? sizeFormate(size) : null
  qualitys.push({ type, size: formattedSize })
  _qualitys[type] = { size: formattedSize }
}

const createQualityInfo = (song, privilege) => {
  const qualitys = []
  const _qualitys = {}
  if (privilege?.maxBrLevel == 'hires' || song.hr) pushQuality(qualitys, _qualitys, 'flac24bit', song.hr?.size)
  switch (privilege?.maxbr ?? 320000) {
    case 999000:
      pushQuality(qualitys, _qualitys, 'flac', song.sq?.size)
    case 320000:
      pushQuality(qualitys, _qualitys, '320k', song.h?.size)
    case 192000:
    case 128000:
      pushQuality(qualitys, _qualitys, '128k', song.l?.size)
      break
    default:
      pushQuality(qualitys, _qualitys, '128k', song.l?.size)
  }
  return { qualitys: qualitys.reverse(), _qualitys }
}

const normalizeNeteaseSong = (song, privilege, extraMeta = {}) => {
  const { qualitys, _qualitys } = createQualityInfo(song, privilege)
  return {
    id: `wy_${song.id}`,
    name: song.name ?? '',
    singer: getSinger(song.ar ?? song.artists),
    source: 'wy',
    interval: typeof song.dt == 'number' ? formatPlayTime(song.dt / 1000) : null,
    meta: {
      songId: song.id,
      albumName: song.al?.name ?? song.album?.name ?? '',
      albumId: song.al?.id ?? song.album?.id,
      picUrl: song.al?.picUrl ?? song.album?.picUrl ?? song.album?.blurPicUrl ?? song.picUrl ?? '',
      qualitys,
      _qualitys,
      ...extraMeta,
    },
  }
}

module.exports = {
  DAILY_SONG_CATEGORY_TAG_KEY_SEPARATOR,
  DAILY_SONG_CATEGORY_PLAYLIST_ID_PREFIX,
  RECOMMEND_HOME_SECTION_IDS,
  getDailySongCategoryTagKey,
  parseDailySongCategoryTagKey,
  getDailySongCategoryPlaylistId,
  parseDailySongCategoryPlaylistId,
  normalizeRecommendHomeSectionOrder,
  moveRecommendHomeSection,
  createMusicIdentity,
  createRecentPlayList,
  getLocalDateKey,
  createDefaultListeningTimeStats,
  normalizeListeningTimeStats,
  addListeningTime,
  formatPlayTime,
  sizeFormate,
  normalizeNeteaseSong,
}
```

- [ ] **Step 2: Run helper tests**

Run: `npm run test:logic`

Expected: PASS for all five tests.

- [ ] **Step 3: Commit helpers**

```bash
git add src/core/netease/helpers.js
git commit -m "feat: add netease mobile helper utilities"
```

## Task 3: Types, Constants, Settings, And Storage

**Files:**
- Create: `src/core/netease/types.d.ts`
- Modify: `src/config/constant.ts`
- Modify: `src/config/defaultSetting.ts`
- Modify: `src/config/migrateSetting.ts`
- Modify: `src/types/app_setting.d.ts`
- Modify: `src/types/music.d.ts`
- Modify: `src/utils/data.ts`

- [ ] **Step 1: Add type declarations**

Create `src/core/netease/types.d.ts` with the `LX.Netease` namespace from the design spec, including `Profile`, `AccountStatus`, `LoginQr`, `LoginQrCheck`, `PrivateFmModeId`, `PrivateFmParams`, `Playlist`, `DailySongTag`, `DailySongCategory`, `HomeChart`, `HomeRecommendation`, and `PlaylistDetailInfo`.

- [ ] **Step 2: Wire constants**

Modify `src/config/constant.ts`:

```ts
export const NAV_MENUS = [
  { id: 'nav_recommend', icon: 'music' },
  { id: 'nav_search', icon: 'search-2' },
  { id: 'nav_songlist', icon: 'album' },
  { id: 'nav_top', icon: 'leaderboard' },
  { id: 'nav_love', icon: 'love' },
  { id: 'nav_setting', icon: 'setting' },
] as const

export const RECOMMEND_HOME_SECTION_IDS = [
  'radarPlaylists',
  'styleSongs',
  'dailySongCategories',
  'similarSongs',
  'recommendPlaylists',
  'charts',
] as const
```

Add storage prefixes:

```ts
neteaseAccount: '@netease_account',
recentPlayList: '@recent_play_list',
listeningTimeStats: '@listening_time_stats',
```

Set `DEFAULT_SETTING.viewPrevState.id` to `nav_recommend`.

- [ ] **Step 3: Add default settings**

Modify `src/config/defaultSetting.ts`:

```ts
'recommend.homeSectionOrder': [...RECOMMEND_HOME_SECTION_IDS],
'recommend.dailySongCategoryTagKeys': null,
'list.myListSidebarScale': 100,
'list.playlistProfileScale': 100,
```

- [ ] **Step 4: Extend app setting types**

Modify `src/types/app_setting.d.ts`:

```ts
type RecommendHomeSectionId = 'radarPlaylists' | 'styleSongs' | 'dailySongCategories' | 'similarSongs' | 'recommendPlaylists' | 'charts'

'recommend.homeSectionOrder': RecommendHomeSectionId[]
'recommend.dailySongCategoryTagKeys': string[] | null
'list.myListSidebarScale': number
'list.playlistProfileScale': number
```

- [ ] **Step 5: Extend music metadata**

Modify `src/types/music.d.ts` `MusicInfoMetaBase`:

```ts
recommendTag?: string | null
```

- [ ] **Step 6: Add storage helpers**

Modify `src/utils/data.ts` by adding key constants from `storageDataPrefix`, then add:

```ts
export const getNeteaseAccountData = async() => {
  return await getData<LX.Netease.NeteaseAccountData | null>(neteaseAccountKey)
}

export const saveNeteaseAccountData = async(data: LX.Netease.NeteaseAccountData) => {
  await saveData(neteaseAccountKey, data)
}

export const getRecentPlayList = async() => {
  return await getData<LX.Music.MusicInfo[]>(recentPlayListKey) ?? []
}

export const saveRecentPlayList = async(list: LX.Music.MusicInfo[]) => {
  await saveData(recentPlayListKey, list)
}

export const getListeningTimeStats = async() => {
  return await getData<LX.Netease.ListeningTimeStats | null>(listeningTimeStatsKey)
}

export const saveListeningTimeStats = async(stats: LX.Netease.ListeningTimeStats) => {
  await saveData(listeningTimeStatsKey, stats)
}
```

- [ ] **Step 7: Run type check**

Run: `npx tsc --noEmit`

Expected: either PASS or only pre-existing errors unrelated to these new files. New setting/type keys must not produce missing-property errors.

- [ ] **Step 8: Commit**

```bash
git add src/config/constant.ts src/config/defaultSetting.ts src/config/migrateSetting.ts src/types/app_setting.d.ts src/types/music.d.ts src/utils/data.ts src/core/netease/types.d.ts
git commit -m "feat: add mobile recommendation settings and types"
```

## Task 4: Mobile WY Service

**Files:**
- Modify: `src/core/netease/index.ts`
- Modify: `src/utils/musicSdk/wy/utils/index.js` if a generic API helper is needed

- [ ] **Step 1: Write service skeleton**

Create `src/core/netease/index.ts` exporting the methods listed in the design. Import `httpFetch`, `weapi`, `linuxapi`, `eapiRequest`, `getNeteaseAccountData`, `saveNeteaseAccountData`, and helpers from `./helpers`.

- [ ] **Step 2: Implement account helpers**

Implement `normalizeCookie`, `normalizeProfile`, `getAccountData`, `saveAccountData`, `refreshLoginStatus`, `getAccountStatus`, `createLoginQr`, `checkLoginQr`, and `logout` using endpoints:

- `/weapi/login/qrcode/unikey`
- `/weapi/login/qrcode/create`
- `/weapi/login/qrcode/client/login`
- `/weapi/w/nuser/account/get`
- `/weapi/logout`

Use the existing mobile request style:

```ts
const requestWeapi = async<T>(url: string, data: Record<string, unknown>, cookie = ''): Promise<T> => {
  const request = httpFetch(`https://music.163.com${url}`, {
    method: 'post',
    headers: { Cookie: cookie },
    form: weapi(data),
  })
  const { body, headers } = await request.promise
  return { ...body, cookie: normalizeCookie(headers?.['set-cookie']) } as T
}
```

- [ ] **Step 3: Implement recommendation methods**

Implement:

- `getRecommendSongs` from `/weapi/v3/discovery/recommend/songs`
- `getPrivateFm` from `/weapi/v1/radio/get` and mode endpoint if available
- `getDailySongCategories` from `/api/homepage/daily/song/config/get`
- `getRecommendPlaylists` from personalized and recommend resource endpoints
- `getHomeRecommendation` using batch/homepage endpoints and desktop parsing rules
- `getPlaylistDetail` using playlist detail plus track completion through song detail
- `likeMusic` through `/weapi/radio/like`
- `trashPrivateFmMusic` through `/weapi/radio/trash/add`
- `getMusicUrl` through song URL v1 endpoint

- [ ] **Step 4: Run logic tests and type check**

Run:

```bash
npm run test:logic
npx tsc --noEmit
```

Expected: helper tests pass and service types compile.

- [ ] **Step 5: Commit**

```bash
git add src/core/netease/index.ts src/utils/musicSdk/wy/utils/index.js
git commit -m "feat: add mobile wy service"
```

## Task 5: Account, Daily Recommend, Private FM, Recent Play, Listening Time Stores

**Files:**
- Create/modify store files listed in File Structure.
- Modify: `src/core/init/dataInit.ts`
- Modify: `src/event/stateEvent.ts` if new update events are needed.

- [ ] **Step 1: Add account state/actions/hooks**

Implement `src/store/netease/state.ts` with:

```ts
export const emptyStatus = { isLoggedIn: false, profile: null }
export default {
  accountStatus: { ...emptyStatus } as LX.Netease.AccountStatus,
  isInitingNeteaseAccount: false,
  isNeteaseAccountInited: false,
}
```

Implement `initNeteaseAccount(force)`, `setNeteaseAccountStatus`, and `logoutNeteaseAccount`.

- [ ] **Step 2: Add daily recommend store**

Implement `DAILY_RECOMMEND_TEMP_LIST_ID`, `loadDailyRecommendSongs`, `getDailyRecommendPlaylistDetail`, `syncDailyRecommendTempList`, and `playDailyRecommend`.

- [ ] **Step 3: Add private FM store**

Implement `PRIVATE_FM_TEMP_LIST_ID`, `privateFmModes`, `preparePrivateFmQueue`, `enterPrivateFmMode`, `exitPrivateFmMode`, `ensurePrivateFmNextSongs`, `setPrivateFmMode`, and `trashPrivateFmMusic`.

- [ ] **Step 4: Add recent play store**

Implement `initRecentPlayList` and `addRecentPlayMusic` using `createRecentPlayList` and throttled `saveRecentPlayList`.

- [ ] **Step 5: Add listening time store**

Implement `initListeningTimeStats`, `addCurrentListeningTime`, and `saveListeningTimeStatsNow` using `addListeningTime` and throttled persistence.

- [ ] **Step 6: Initialize stores**

Modify `src/core/init/dataInit.ts`:

```ts
void initNeteaseAccount().catch(err => console.log(err))
void initRecentPlayList().catch(err => console.log(err))
void initListeningTimeStats().catch(err => console.log(err))
```

- [ ] **Step 7: Run checks**

Run:

```bash
npm run test:logic
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/store/netease src/store/dailyRecommend src/store/privateFm src/store/recentPlay src/store/listeningTime src/core/init/dataInit.ts src/event/stateEvent.ts
git commit -m "feat: add recommendation playback stores"
```

## Task 6: Playback Fallback, Recent Play, Listening Time, And Favorite Sync

**Files:**
- Modify: `src/core/player/player.ts`
- Modify: `src/core/player/playInfo.ts`
- Modify: `src/core/list.ts`
- Modify: `src/event/listEvent.ts`

- [ ] **Step 1: Add WY project-source fallback**

In `src/core/player/player.ts`, add `findBestProjectSourceMusic` before `getMusicPlayUrl`. It searches `musicSdk.findMusic` with `{ name, singer, albumName, interval, source }`, ignores `wy`, verifies `global.lx.qualityList[source]`, caches `musicInfo.meta.toggleMusicInfo`, and retries URL fetch against the matched source.

- [ ] **Step 2: Call fallback from URL resolution**

Update `getMusicPlayUrl` to try:

1. cached `meta.toggleMusicInfo`
2. `findBestProjectSourceMusic` for `source == 'wy'`
3. normal `getMusicUrl`

Do not prefer direct WY URLs for recommendation songs.

- [ ] **Step 3: Track recent play and listening time**

On successful play-music changes, call `addRecentPlayMusic` with the source music info. On playback progress, add elapsed real seconds through `addCurrentListeningTime`.

- [ ] **Step 4: Keep private FM queue fed**

After `playNext` and on player music changes, call `ensurePrivateFmNextSongs`. When the player list leaves the private FM temp list, call `exitPrivateFmMode`.

- [ ] **Step 5: Sync WY like after loved-list add**

In the local list-add path, after adding to `LIST_IDS.LOVE`, call `likeMusic` for each `source == 'wy'` item. Catch errors and log them without reverting the local add.

- [ ] **Step 6: Run checks**

Run:

```bash
npm run test:logic
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/core/player/player.ts src/core/player/playInfo.ts src/core/list.ts src/event/listEvent.ts
git commit -m "feat: add wy playback fallback and listening stats"
```

## Task 7: WY Playlist Detail And Virtual Playlists

**Files:**
- Modify: `src/core/songlist.ts`
- Modify: `src/screens/SonglistDetail/listAction.ts`
- Modify: `src/screens/SonglistDetail/Header.tsx`
- Modify: `src/screens/SonglistDetail/MusicList.tsx`

- [ ] **Step 1: Add WY branch to `getListDetail`**

If `source == 'wy'`, call `getNeteasePlaylistDetail(id, page)` from `src/core/netease`. If the ID matches `DAILY_RECOMMEND_TEMP_LIST_ID` or `parseDailySongCategoryPlaylistId(id)`, route to the corresponding virtual detail action.

- [ ] **Step 2: Add WY branch to `getListDetailAll`**

Load all pages from the WY detail branch until `page >= maxPage`, then de-duplicate.

- [ ] **Step 3: Update play and collect actions**

Ensure `handlePlay(id, 'wy')` sets temp list ID as `wy__${id}` and plays through the temp list. Ensure collect creates a user list with `source: 'wy'` and `sourceListId: id`.

- [ ] **Step 4: Run checks**

Run:

```bash
npm run test:logic
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/core/songlist.ts src/screens/SonglistDetail/listAction.ts src/screens/SonglistDetail/Header.tsx src/screens/SonglistDetail/MusicList.tsx
git commit -m "feat: support wy and virtual playlist details"
```

## Task 8: Recommendation Navigation And Screen

**Files:**
- Create/modify recommendation screen files listed in File Structure.
- Modify: `src/screens/Home/Vertical/Main.tsx`
- Modify: `src/screens/Home/Vertical/BottomNav.tsx`
- Modify: `src/screens/Home/Vertical/DrawerNav.tsx`
- Modify: `src/screens/Home/Horizontal/Aside.tsx`

- [ ] **Step 1: Add `RecommendPage` to the pager**

In `Main.tsx`, import `Recommend`, add `nav_recommend: 0`, shift existing indices, and add a first `<View key="nav_recommend">`.

- [ ] **Step 2: Add mobile nav labels and order**

Use `NAV_MENUS` for drawer/horizontal. For bottom nav, include `nav_recommend`, `nav_search`, `nav_songlist`, `nav_top`, and `nav_love`. Keep settings in drawer/horizontal if five bottom items become crowded.

- [ ] **Step 3: Implement recommendation screen data flow**

`src/screens/Home/Views/Recommend/index.tsx` loads account status and recommendation data on first mount, saves/restores scroll position, and renders:

```tsx
<AccountHeader />
<SpecialCards />
<PlaylistRail sectionId="radarPlaylists" />
<SongSection sectionId="styleSongs" />
<PlaylistRail sectionId="dailySongCategories" />
<SongSection sectionId="similarSongs" />
<PlaylistRail sectionId="recommendPlaylists" />
<ChartRail />
```

Render sections in `recommend.homeSectionOrder`.

- [ ] **Step 4: Implement account/login UI**

`AccountHeader` shows avatar or `LX`, nickname or login prompt. `LoginQrModal` creates a QR, polls every 2 seconds while visible, stops on close, and calls `setNeteaseAccountStatus` on code `803`.

- [ ] **Step 5: Implement cards and sections**

Special cards:

- Daily Recommend: play button calls `playDailyRecommend`.
- Private FM: play button calls `enterPrivateFmMode` and pause/play if already active.
- Private Radar: opens/plays playlist ID `3136952023`.

Rails use horizontal `FlatList`. Song sections show cover, name, singer, `recommendTag`, play-all, refresh, and love buttons.

- [ ] **Step 6: Run checks**

Run:

```bash
npm run test:logic
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/screens/Home/Views/Recommend src/screens/Home/Vertical/Main.tsx src/screens/Home/Vertical/BottomNav.tsx src/screens/Home/Vertical/DrawerNav.tsx src/screens/Home/Horizontal/Aside.tsx
git commit -m "feat: add mobile recommendation home"
```

## Task 9: Settings, Recent Play, Listening Time, And Queue UI

**Files:**
- Create/modify setting files listed in File Structure.
- Modify: `src/screens/Home/Views/Setting/Main.tsx`
- Modify: `src/screens/Home/Views/Setting/Vertical/NavList.tsx`
- Modify: `src/screens/Home/Views/Setting/Horizontal/NavList.tsx`
- Modify: `src/components/player/PlayerBar/index.tsx`
- Modify: play detail controls if adding queue entry there.

- [ ] **Step 1: Add recommendation settings**

Add `SettingRecommend` with `SectionOrder` and `DailySongTags`. Section order uses `moveRecommendHomeSection`; tags load `getDailySongCategories`, display chips grouped by category, and save tag keys.

- [ ] **Step 2: Add listening time settings**

Display total, today, week, seven-day bars, song count, and top songs using `listeningTimeStats`.

- [ ] **Step 3: Add play queue modal**

`PlayQueueModal` displays current temp queue and played list, supports remove and clear actions through existing temp list actions, and is opened from player controls.

- [ ] **Step 4: Add recent play entry**

Add a compact section in Mylist or Recommend that opens a virtual temp list of `recentPlayList` and can play from any index.

- [ ] **Step 5: Run checks**

Run:

```bash
npm run test:logic
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/screens/Home/Views/Setting src/components/player/PlayQueueModal.tsx src/components/player/PlayerBar/index.tsx src/screens/Home/Views/Mylist
git commit -m "feat: add recommendation settings and listening stats UI"
```

## Task 10: i18n, Docs, And Mobile-Equivalent Cleanup

**Files:**
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`
- Modify: `README.md`

- [ ] **Step 1: Add language keys**

Add keys for `nav_recommend`, WY account/login, recommendation sections, private FM modes, section refresh, daily song tags, recent play, listening time, queue, and mobile equivalents for desktop-only items.

- [ ] **Step 2: Update README**

Document:

- WY recommendations and private FM.
- WY liked sync.
- WebDAV cloud list.
- Recent play and listening time.
- Desktop-only features adapted or skipped on mobile.

- [ ] **Step 3: Run checks**

Run:

```bash
npm run test:logic
npx tsc --noEmit
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json README.md
git commit -m "docs: document mobile recommendation features"
```

## Task 11: Final Verification

**Files:**
- No planned source edits unless verification finds defects.

- [ ] **Step 1: Run pure logic tests**

Run: `npm run test:logic`

Expected: all tests pass.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`

Expected: pass or only documented pre-existing errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: pass or only documented pre-existing lint issues.

- [ ] **Step 4: Build Android JS bundle**

Run: `npm run build-test`

Expected: Metro bundle succeeds and produces `index.android.bundle` and assets.

- [ ] **Step 5: Manual smoke checklist**

Verify on Android emulator/device:

- Recommend tab opens first.
- QR modal opens, can be closed, and polling stops.
- Guest recommendation sections render without login where supported.
- Daily recommend and private FM show login-required errors when logged out.
- WY playlist detail opens and returns without resetting recommendation scroll.
- WY recommended song playback attempts LX source matching.
- Adding a WY song to loved list does not crash if WY like sync fails.
- Recent play updates after playback.
- Listening time increases only while playing.
- WebDAV existing settings and list still work.
- Party existing entry still compiles and previous behavior remains intact.

- [ ] **Step 6: Commit verification fixes**

If fixes were needed:

```bash
git add <fixed-files>
git commit -m "fix: stabilize mobile recommendation port"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

Spec coverage:

- WY account/service: Tasks 3-5.
- Recommendation UI/cache/refresh: Tasks 5 and 8.
- Playback fallback/favorite sync: Task 6.
- Playlist detail/virtual playlists: Task 7.
- Recent play/listening time: Tasks 5, 6, and 9.
- Settings/i18n/docs: Tasks 9 and 10.
- Mobile equivalents for tray/queue/lyrics/list scale: Tasks 9 and 10.
- Desktop-only exclusions are documented in the design spec and README update task.

Placeholder scan:

- The plan intentionally avoids `TODO`, `TBD`, and unspecified "handle later" steps.
- Large UI and service tasks specify file paths, public functions, endpoint groups, and verification commands; exact endpoint implementation remains within the task's listed API surface.

Type consistency:

- Section IDs match `RECOMMEND_HOME_SECTION_IDS`.
- Virtual daily category IDs match `daily_song_category__${categoryId}__${tagId}`.
- Recent/listening identity is consistently `source:id`.
