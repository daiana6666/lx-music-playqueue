# Current Project Code Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the reproducible correctness, state-consistency, lifecycle, navigation, and dependency issues found in the current working tree without disturbing unrelated user changes.

**Architecture:** Keep network parsing and state decisions in CommonJS helpers that the existing Node test runner can exercise, while leaving React Native orchestration in the current TypeScript modules. Use focused source-contract tests only for thin UI wiring that has no component-test harness, and keep every fix local to the feature that owns the behavior.

**Tech Stack:** React Native 0.73, TypeScript 5.9, CommonJS helper modules, Node `node:test`, ESLint, Gradle/Android.

---

## Confirmed Findings

| Priority | Finding | Repair task |
| --- | --- | --- |
| P1 | Opening Recommend fetches Private FM preview data into the process-wide temp queue, replacing unrelated playback state. | Task 2 |
| P1 | WY project-source playback reuses a failed cached match and stops after the first newly matched source. | Task 3 |
| P1 | A rejected next-track lookup leaves preloading permanently marked as in flight. | Task 4 |
| P1 | Screen-off playback is discarded as a seek, and non-1x playback records media time instead of real listening time. | Task 5 |
| P1 | A partial Netease response cookie replaces the stored cookie string and can remove `MUSIC_U`. | Task 1 |
| P2 | Expired and unknown QR login statuses continue polling indefinitely. | Task 1 |
| P2 | Removing the active synchronized custom source first reselects the deleted ID and enters an avoidable failure path. | Task 6 |
| P2 | The mobile port omits the recent-play entry, records failed playback attempts as recent, hides two specified bottom destinations, and cannot render listening stats in the vertical settings list. | Task 7 |
| P2 | WebDAV is presented as read-only at song level but still exposes list-level sort, de-duplication, and import mutations. | Task 8 |
| P2 | A late previous-list storage read can overwrite a newer selection, and a delayed save can persist WebDAV instead of the last persistent list. | Task 9 |
| P2 | The lockfile resolves vulnerable `@babel/core` 7.29.0 even though a compatible patched 7.x release is available. | Task 10 |

The official-registry audit also reports a transitive moderate `fast-xml-parser` advisory. Its available automatic fix moves React Native from 0.73 to 0.86, so it is a documented residual risk rather than an in-scope forced upgrade.

## File Map

- `src/core/netease/helpers.js` owns cookie parsing/merging and QR polling decisions.
- `src/core/netease/index.ts` applies merged response cookies to persisted account state.
- `src/screens/Home/Views/Recommend/components/LoginQrModal.tsx` stops polling terminal QR states.
- `src/store/privateFm/action.ts` separates recommendation preview data from the shared temp playback list.
- `src/core/player/helpers.js` owns project-source candidate fallback and preload lock cleanup.
- `src/core/player/helpers.d.ts` declares the helper contracts used by TypeScript.
- `src/core/player/player.ts` resolves WY playback through every valid project-source candidate.
- `src/core/init/player/preloadNextMusic.ts` always releases its in-flight guard.
- `src/core/init/player/listeningTime.js` owns rate-aware listening-time accumulation.
- `src/core/init/player/listeningTime.d.ts` declares the listening tracker.
- `src/core/init/player/playProgress.ts` feeds progress and screen lifecycle changes to the tracker.
- `src/core/userApiSync/helpers.js` selects a valid source after a synchronized custom source disappears.
- `src/core/userApiSync/helpers.d.ts` declares that source-selection helper.
- `src/core/userApi.ts` switches directly to an enabled built-in source after sync removal.
- `src/core/init/player/playerEvent.ts` records recent play only after playback actually starts.
- `src/screens/Home/Vertical/BottomNav.tsx` restores all five specified primary destinations.
- `src/screens/Home/Views/Setting/Vertical/Main.tsx` renders the listening-time screen.
- `src/screens/Home/Views/Recommend/index.tsx` exposes the collected recent-play list.
- `src/screens/Home/Views/Mylist/MyList/ListMenu.tsx` enforces the WebDAV list's read-only boundary.
- `src/utils/latestAsyncValue.js` prevents a stale async load from overwriting a newer selection.
- `src/utils/latestAsyncValue.d.ts` declares the async value holder.
- `src/utils/data.ts` uses that holder for the previous-list selection.
- `test/core/netease/helpers.test.cjs` covers cookie preservation and QR terminal states.
- `test/core/player/helpers.test.cjs` covers playback fallback and rejected preload cleanup.
- `test/core/init/player/listeningTime.test.cjs` covers playback rate, fractional time, seeks, and screen-off gaps.
- `test/core/userApiSync/helpers.test.cjs` covers active custom-source removal.
- `test/utils/latestAsyncValue.test.cjs` reproduces stale load completion after a user update.
- `test/integration/mobilePortWiring.test.cjs` checks the thin React Native wiring that cannot be imported by the Node runner.
- `package.json` and `package-lock.json` update Babel to the patched 7.x release.

## Task 1: Preserve Login Cookies And Stop Expired QR Polling

**Files:**
- Modify: `src/core/netease/helpers.js`
- Modify: `src/core/netease/index.ts:64`
- Modify: `src/screens/Home/Views/Recommend/components/LoginQrModal.tsx:84`
- Test: `test/core/netease/helpers.test.cjs`

- [ ] **Step 1: Write failing cookie and QR-state tests**

Append these tests and import `mergeNeteaseCookies` and `shouldContinueLoginQrPolling` from the helper module:

```js
test('cookie merge preserves login tokens and applies partial response updates', () => {
  assert.equal(
    mergeNeteaseCookies(
      'MUSIC_U=login-token; __csrf=old-token',
      ['__csrf=new-token; Path=/; HttpOnly', 'NMTID=device-token; Max-Age=31536000'],
    ),
    'MUSIC_U=login-token; __csrf=new-token; NMTID=device-token',
  )
})

test('login QR polling continues only for waiting and scanned states', () => {
  assert.equal(shouldContinueLoginQrPolling(801), true)
  assert.equal(shouldContinueLoginQrPolling(802), true)
  assert.equal(shouldContinueLoginQrPolling(800), false)
  assert.equal(shouldContinueLoginQrPolling(803), false)
  assert.equal(shouldContinueLoginQrPolling(0), false)
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `node --test test/core/netease/helpers.test.cjs`

Expected: FAIL because `mergeNeteaseCookies` and `shouldContinueLoginQrPolling` are not exported.

- [ ] **Step 3: Add the pure helpers**

Add the following implementation to `src/core/netease/helpers.js` and export both functions:

```js
const COOKIE_ATTRIBUTE_NAMES = new Set([
  'domain', 'expires', 'httponly', 'max-age', 'path', 'samesite', 'secure',
])

const collectCookiePairs = (value, target = new Map()) => {
  const values = Array.isArray(value) ? value : [value]
  for (const rawValue of values) {
    if (!rawValue) continue
    for (const part of String(rawValue).split(';')) {
      const index = part.indexOf('=')
      if (index < 1) continue
      const name = part.slice(0, index).trim()
      if (!name || COOKIE_ATTRIBUTE_NAMES.has(name.toLowerCase())) continue
      target.set(name, part.slice(index + 1).trim())
    }
  }
  return target
}

const mergeNeteaseCookies = (oldCookie, nextCookie) => {
  const cookies = collectCookiePairs(oldCookie)
  collectCookiePairs(nextCookie, cookies)
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

const shouldContinueLoginQrPolling = code => code == 801 || code == 802
```

- [ ] **Step 4: Route account and modal behavior through the helpers**

Import `mergeNeteaseCookies` in `src/core/netease/index.ts`, delete the local `mergeCookie`, and use:

```ts
const nextCookie = mergeNeteaseCookies(cookie, body.cookie)
```

Import `shouldContinueLoginQrPolling` in `LoginQrModal.tsx` and replace the unconditional reschedule after non-803 responses with:

```ts
if (shouldContinueLoginQrPolling(result.code)) schedulePoll(key)
```

Keep the existing success close path and transient network-error retry path unchanged.

- [ ] **Step 5: Run the focused test**

Run: `node --test test/core/netease/helpers.test.cjs`

Expected: all Netease helper tests PASS.

- [ ] **Step 6: Commit the focused fix**

```bash
git add src/core/netease/helpers.js src/core/netease/index.ts src/screens/Home/Views/Recommend/components/LoginQrModal.tsx test/core/netease/helpers.test.cjs
git commit -m "fix: preserve netease sessions and stop expired qr polling"
```

## Task 2: Keep Private FM Preview Out Of The Shared Temp Queue

**Files:**
- Modify: `src/store/privateFm/action.ts:28`
- Test: `test/integration/mobilePortWiring.test.cjs`

- [ ] **Step 1: Add a failing source-contract test**

Create `test/integration/mobilePortWiring.test.cjs` with:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relativePath => fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8')

test('private FM preview does not replace the shared temp list before entry', () => {
  const source = read('src/store/privateFm/action.ts')
  const prepare = source.slice(
    source.indexOf('export const preparePrivateFmQueue'),
    source.indexOf('export const enterPrivateFmMode'),
  )
  const enter = source.slice(
    source.indexOf('export const enterPrivateFmMode'),
    source.indexOf('export const exitPrivateFmMode'),
  )

  assert.doesNotMatch(prepare, /setTempList\(/)
  assert.match(enter, /setTempList\(PRIVATE_FM_TEMP_LIST_ID, state\.privateFmList\)/)
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `node --test test/integration/mobilePortWiring.test.cjs`

Expected: FAIL because `preparePrivateFmQueue` currently calls `setTempList`.

- [ ] **Step 3: Move temp-list activation into the entry action**

Change the two functions to the following behavior:

```ts
export const preparePrivateFmQueue = async(force = false) => {
  if (preparePrivateFmPromise) return preparePrivateFmPromise
  if (appendNextSongsPromise) return appendNextSongsPromise
  if (state.privateFmList.length && (!force || state.isPrivateFmActive)) return state.privateFmList
  state.isLoadingPrivateFm = true
  emitPrivateFmState()
  const promise = (async() => {
    state.privateFmList = await getPrivateFm({ mode: state.privateFmMode, limit: 3 })
    return state.privateFmList
  })()
  preparePrivateFmPromise = promise
  return promise.finally(() => {
    if (preparePrivateFmPromise == promise) preparePrivateFmPromise = null
    state.isLoadingPrivateFm = false
    emitPrivateFmState()
  })
}

export const enterPrivateFmMode = async(index = 0) => {
  await preparePrivateFmQueue(true)
  await setTempList(PRIVATE_FM_TEMP_LIST_ID, state.privateFmList)
  state.isPrivateFmActive = true
  emitPrivateFmState()
  await playList(LIST_IDS.TEMP, index)
}
```

The active-session guard prevents a recommendation refresh from replacing the queue that is currently playing.

- [ ] **Step 4: Run focused private FM tests**

Run: `node --test test/store/privateFm/helpers.test.cjs test/integration/mobilePortWiring.test.cjs`

Expected: both test files PASS.

- [ ] **Step 5: Commit the focused fix**

```bash
git add src/store/privateFm/action.ts test/integration/mobilePortWiring.test.cjs
git commit -m "fix: isolate private fm preview from playback queue"
```

## Task 3: Try Every Valid Project-Source Playback Candidate

**Files:**
- Modify: `src/core/player/helpers.js`
- Modify: `src/core/player/helpers.d.ts`
- Modify: `src/core/player/player.ts:181`
- Test: `test/core/player/helpers.test.cjs`

- [ ] **Step 1: Write the failing fallback test**

Import `resolveProjectSourceResource` and append:

```js
test('project-source fallback skips stale and failed candidates', async() => {
  const attempted = []
  const stale = { id: 'stale', source: 'kw' }
  const first = { id: 'first', source: 'kg' }
  const playable = { id: 'playable', source: 'tx' }

  const result = await resolveProjectSourceResource({
    cachedMusicInfo: stale,
    matchedList: [stale, first, playable],
    normalizeMusicInfo: value => value,
    canUse: () => true,
    getResource: async(musicInfo) => {
      attempted.push(musicInfo.id)
      if (musicInfo.id != 'playable') throw new Error('unavailable')
      return `https://media.example/${musicInfo.id}`
    },
  })

  assert.deepEqual(attempted, ['stale', 'first', 'playable'])
  assert.deepEqual(result, {
    musicInfo: playable,
    resource: 'https://media.example/playable',
  })
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `node --test test/core/player/helpers.test.cjs`

Expected: FAIL because `resolveProjectSourceResource` does not exist.

- [ ] **Step 3: Implement candidate iteration**

Add and export this helper:

```js
const resolveProjectSourceResource = async({
  cachedMusicInfo,
  matchedList,
  normalizeMusicInfo,
  canUse,
  getResource,
}) => {
  const candidates = cachedMusicInfo ? [cachedMusicInfo, ...matchedList] : matchedList
  const seen = new Set()
  for (const item of candidates) {
    const musicInfo = item === cachedMusicInfo ? item : normalizeMusicInfo(item)
    const identity = createPlayerMusicIdentity(musicInfo)
    if (!identity || seen.has(identity) || !canUse(musicInfo)) continue
    seen.add(identity)
    try {
      const resource = await getResource(musicInfo)
      if (typeof resource == 'string' ? resource : resource?.url) return { musicInfo, resource }
    } catch {}
  }
  return null
}
```

Declare it in `helpers.d.ts` with:

```ts
import type { PlayerResourceInput } from '@/plugins/player/utils'

export function resolveProjectSourceResource<Input>(params: {
  cachedMusicInfo?: LX.Music.MusicInfoOnline | null
  matchedList: Input[]
  normalizeMusicInfo: (musicInfo: Input) => LX.Music.MusicInfoOnline
  canUse: (musicInfo: LX.Music.MusicInfoOnline) => boolean
  getResource: (musicInfo: LX.Music.MusicInfoOnline) => Promise<PlayerResourceInput>
}): Promise<{
  musicInfo: LX.Music.MusicInfoOnline
  resource: PlayerResourceInput
} | null>
```

- [ ] **Step 4: Use the helper from WY playback resolution**

Replace `findBestProjectSourceMusic` with a resolver that searches once, tries the cached source first, then every unique usable match, and only caches a source after URL retrieval succeeds:

```ts
const getProjectSourceResource = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, isRefresh: boolean) => {
  const targetMusicInfo = getTargetMusicInfo(musicInfo)
  const matchedList = await findMusic({
    name: targetMusicInfo.name,
    singer: targetMusicInfo.singer,
    albumName: targetMusicInfo.meta.albumName,
    interval: targetMusicInfo.interval ?? '',
    source: targetMusicInfo.source,
  })
  const result = await resolveProjectSourceResource({
    cachedMusicInfo: targetMusicInfo.meta.toggleMusicInfo,
    matchedList,
    normalizeMusicInfo: oldMusicInfo => toNewMusicInfo(oldMusicInfo) as LX.Music.MusicInfoOnline,
    canUse: candidate => candidate.source != 'wy' &&
      !!global.lx.qualityList[candidate.source] &&
      !!musicSdk[candidate.source]?.getMusicUrl,
    getResource: candidate => getMusicUrl({
      musicInfo: candidate,
      isRefresh,
      allowToggleSource: false,
    }),
  })
  if (!result) throw new Error(global.i18n.t('toggle_source_failed'))
  targetMusicInfo.meta.toggleMusicInfo = result.musicInfo
  if (!diffCurrentMusicInfo(musicInfo)) setStatusText(global.i18n.t('toggle_source_try'))
  return result.resource
}
```

At the beginning of `getMusicPlayUrl`, use this resolver when `shouldUseProjectSourceOnly(targetMusicInfo)` is true. Preserve the normal-source branch for non-WY music.

- [ ] **Step 5: Run the focused tests and type check**

Run: `node --test test/core/player/helpers.test.cjs`

Run: `npx tsc --noEmit`

Expected: all player helper tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the focused fix**

```bash
git add src/core/player/helpers.js src/core/player/helpers.d.ts src/core/player/player.ts test/core/player/helpers.test.cjs
git commit -m "fix: continue through project source playback fallbacks"
```

## Task 4: Release The Preload Lock After Rejection

**Files:**
- Modify: `src/core/player/helpers.js`
- Modify: `src/core/player/helpers.d.ts`
- Modify: `src/core/init/player/preloadNextMusic.ts:18`
- Test: `test/core/player/helpers.test.cjs`

- [ ] **Step 1: Write a failing rejection-cleanup test**

Import `runWithLoadingState` and append:

```js
test('preload loading state is released when the task rejects', async() => {
  const state = { isLoading: false }
  await assert.rejects(
    runWithLoadingState(state, async() => { throw new Error('next-track failure') }),
    /next-track failure/,
  )
  assert.equal(state.isLoading, false)
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `node --test test/core/player/helpers.test.cjs`

Expected: FAIL because `runWithLoadingState` does not exist.

- [ ] **Step 3: Add the lock helper and wrap the preload body**

Add and export:

```js
const runWithLoadingState = async(state, task) => {
  if (state.isLoading) return undefined
  state.isLoading = true
  try {
    return await task()
  } finally {
    state.isLoading = false
  }
}
```

Declare the helper in `helpers.d.ts`:

```ts
export function runWithLoadingState<T>(
  state: { isLoading: boolean },
  task: () => Promise<T>,
): Promise<T | undefined>
```

Replace `preloadNextMusicUrl` with:

```ts
const preloadNextMusicUrl = async(curTime: number) => {
  if (curTime - preloadMusicInfo.preProgress < 3) return
  return runWithLoadingState(preloadMusicInfo, async() => {
    console.log('preload next music url')
    const info = await getNextPlayMusicInfo()
    if (!info) return
    preloadMusicInfo.info = info
    const resource = await getMusicUrl({ musicInfo: info.musicInfo }).catch(() => '')
    const url = typeof resource == 'string' ? resource : resource.url
    if (!url) return
    console.log('preload url', url)
    const checkOptions = typeof resource == 'string' ? undefined : { headers: resource.headers }
    const [cached, available] = await Promise.all([
      isCached(url),
      checkUrl(url, checkOptions).then(() => true).catch(() => false),
    ])
    if (cached || available) return
    const refreshedResource = await getMusicUrl({
      musicInfo: info.musicInfo,
      isRefresh: true,
    }).catch(() => '')
    const refreshedUrl = typeof refreshedResource == 'string'
      ? refreshedResource
      : refreshedResource.url
    console.log('preload url refresh', refreshedUrl)
  })
}
```

- [ ] **Step 4: Run the focused tests**

Run: `node --test test/core/player/helpers.test.cjs`

Expected: all player helper tests PASS.

- [ ] **Step 5: Commit the focused fix**

```bash
git add src/core/player/helpers.js src/core/player/helpers.d.ts src/core/init/player/preloadNextMusic.ts test/core/player/helpers.test.cjs
git commit -m "fix: release next-track preload lock on failure"
```

## Task 5: Count Real Listening Time Across Rates And Screen-Off Gaps

**Files:**
- Create: `src/core/init/player/listeningTime.js`
- Create: `src/core/init/player/listeningTime.d.ts`
- Modify: `src/core/init/player/playProgress.ts:21`
- Create: `test/core/init/player/listeningTime.test.cjs`

- [ ] **Step 1: Write failing tracker tests**

Create the test file:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createListeningTimeTracker } = require('../../../../src/core/init/player/listeningTime.js')

test('listening tracker converts media progress to real time at playback rate', () => {
  const tracker = createListeningTimeTracker()
  tracker.reset(10)
  assert.equal(tracker.update(14, 2), 2)
})

test('listening tracker carries fractional real seconds', () => {
  const tracker = createListeningTimeTracker()
  tracker.reset(0)
  assert.equal(tracker.update(1, 2), 0)
  assert.equal(tracker.update(2, 2), 1)
})

test('listening tracker accepts one long screen-off gap but rejects a seek', () => {
  const tracker = createListeningTimeTracker()
  tracker.reset(0)
  assert.equal(tracker.update(120, 1), 0)
  tracker.reset(0)
  tracker.allowLongGap()
  assert.equal(tracker.update(120, 2), 60)
})
```

- [ ] **Step 2: Run the tests and verify the red state**

Run: `node --test test/core/init/player/listeningTime.test.cjs`

Expected: FAIL because the tracker module does not exist.

- [ ] **Step 3: Implement the tracker**

Create `listeningTime.js`:

```js
const createListeningTimeTracker = () => {
  let lastPosition = 0
  let carrySeconds = 0
  let longGapAllowed = false
  return {
    reset(position = 0) {
      lastPosition = Number(position) || 0
      carrySeconds = 0
      longGapAllowed = false
    },
    allowLongGap() {
      longGapAllowed = true
    },
    update(position, playbackRate = 1) {
      const nextPosition = Number(position) || 0
      const delta = nextPosition - lastPosition
      lastPosition = nextPosition
      const allowLongGap = longGapAllowed
      longGapAllowed = false
      if (delta <= 0 || (delta > 5 && !allowLongGap)) return 0
      carrySeconds += delta / Math.max(0.1, Number(playbackRate) || 1)
      const seconds = Math.floor(carrySeconds)
      carrySeconds -= seconds
      return seconds
    },
  }
}

module.exports = { createListeningTimeTracker }
```

Create `listeningTime.d.ts`:

```ts
export interface ListeningTimeTracker {
  reset: (position?: number) => void
  allowLongGap: () => void
  update: (position: number, playbackRate?: number) => number
}

export function createListeningTimeTracker(): ListeningTimeTracker
```

- [ ] **Step 4: Integrate the tracker into playback progress**

Replace `lastListeningTime` and `addListeningTimeByPosition` with one tracker instance. On each accepted position, call:

```ts
const seconds = listeningTimeTracker.update(position, settingState.setting['player.playbackRate'])
if (playerState.isPlay && playerState.playMusicInfo.musicInfo && seconds) {
  addCurrentListeningTime(seconds)
}
```

Call `listeningTimeTracker.reset(time)` from `setProgress`, `handlePlay`, and `handleStop`. Call `listeningTimeTracker.allowLongGap()` when the screen changes to `OFF`, before stopping progress polling. This preserves seek rejection while allowing the next resumed position to account for valid background playback.

- [ ] **Step 5: Run focused tests and type check**

Run: `node --test test/core/init/player/listeningTime.test.cjs`

Run: `npx tsc --noEmit`

Expected: tracker tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the focused fix**

```bash
git add src/core/init/player/listeningTime.js src/core/init/player/listeningTime.d.ts src/core/init/player/playProgress.ts test/core/init/player/listeningTime.test.cjs
git commit -m "fix: count background listening time at playback rate"
```

## Task 6: Select A Valid API Source After Sync Removal

**Files:**
- Modify: `src/core/userApiSync/helpers.js`
- Modify: `src/core/userApiSync/helpers.d.ts`
- Modify: `src/core/userApi.ts:45`
- Test: `test/core/userApiSync/helpers.test.cjs`

- [ ] **Step 1: Write the failing source-selection test**

Import `resolveSyncedApiSource` and append:

```js
test('removed active custom source falls back directly to a built-in source', () => {
  assert.equal(
    resolveSyncedApiSource('user_api_removed', [{ id: 'user_api_keep' }], 'kw'),
    'kw',
  )
  assert.equal(
    resolveSyncedApiSource('user_api_keep', [{ id: 'user_api_keep' }], 'kw'),
    'user_api_keep',
  )
  assert.equal(resolveSyncedApiSource('kg', [], 'kw'), 'kg')
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `node --test test/core/userApiSync/helpers.test.cjs`

Expected: FAIL because `resolveSyncedApiSource` does not exist.

- [ ] **Step 3: Implement and declare the source resolver**

Add and export:

```js
const resolveSyncedApiSource = (activeApiId, nextApis, fallbackApiId) => {
  if (!/^user_api/.test(activeApiId)) return activeApiId
  return nextApis.some(api => api.id == activeApiId) ? activeApiId : fallbackApiId
}
```

Declare it in `helpers.d.ts`:

```ts
export function resolveSyncedApiSource(
  activeApiId: string,
  nextApis: LX.UserApi.UserApiInfo[],
  fallbackApiId: string,
): string
```

- [ ] **Step 4: Switch directly to the resolved source**

In `setUserApiSyncData`, compute the enabled built-in fallback and use the resolved ID:

```ts
const fallbackApiId = apiSourceInfo.find(api => !api.disabled)?.id ?? ''
const nextApiId = resolveSyncedApiSource(activeApiId, list, fallbackApiId)
if (!/^user_api/.test(nextApiId)) {
  const { setApiSource } = await import('./apiSource')
  setApiSource(nextApiId)
  return
}
await setUserApi(nextApiId)
```

Import `apiSourceInfo` and `resolveSyncedApiSource`; remove the call that passes the deleted ID back to `setApiSource`.

- [ ] **Step 5: Run the focused tests and type check**

Run: `node --test test/core/userApiSync/helpers.test.cjs`

Run: `npx tsc --noEmit`

Expected: user API sync tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the focused fix**

```bash
git add src/core/userApiSync/helpers.js src/core/userApiSync/helpers.d.ts src/core/userApi.ts test/core/userApiSync/helpers.test.cjs
git commit -m "fix: recover active source after user api sync removal"
```

## Task 7: Restore Mobile Navigation, Listening Stats, And Recent Plays

**Files:**
- Modify: `src/core/player/player.ts:35`
- Modify: `src/core/init/player/playerEvent.ts:70`
- Modify: `src/screens/Home/Vertical/BottomNav.tsx:13`
- Modify: `src/screens/Home/Views/Setting/Vertical/Main.tsx:8`
- Modify: `src/screens/Home/Views/Recommend/index.tsx:1`
- Test: `test/integration/mobilePortWiring.test.cjs`

- [ ] **Step 1: Add failing wiring tests**

Append:

```js
test('vertical primary navigation exposes all five specified destinations', () => {
  const source = read('src/screens/Home/Vertical/BottomNav.tsx')
  for (const id of ['nav_recommend', 'nav_search', 'nav_songlist', 'nav_top', 'nav_love']) {
    assert.match(source, new RegExp(`id: '${id}'`))
  }
})

test('vertical settings renders every declared listening-time destination', () => {
  const source = read('src/screens/Home/Views/Setting/Vertical/Main.tsx')
  assert.match(source, /import ListeningTime from '\.\.\/settings\/ListeningTime'/)
  assert.match(source, /case 'listening_time': return <ListeningTime \/>/)
})

test('recommend screen exposes recent plays and records them only after playback starts', () => {
  const recommend = read('src/screens/Home/Views/Recommend/index.tsx')
  const player = read('src/core/player/player.ts')
  const playerEvent = read('src/core/init/player/playerEvent.ts')
  assert.match(recommend, /useRecentPlayList\(\)/)
  assert.match(recommend, /title=\{t\('recent_play'\)\}/)
  assert.doesNotMatch(player, /addRecentPlayMusic\(/)
  assert.match(playerEvent, /const handlePlaying[\s\S]*addRecentPlayMusic\(/)
})
```

- [ ] **Step 2: Run the integration test and verify the red state**

Run: `node --test test/integration/mobilePortWiring.test.cjs`

Expected: FAIL for the missing bottom destinations, listening-time branch, recent-play UI, and successful-play recording.

- [ ] **Step 3: Restore the missing navigation and settings branches**

Set `navItems` to:

```ts
const navItems: Array<{ id: NAV_ID_Type, icon: string }> = [
  { id: 'nav_recommend', icon: 'music_time' },
  { id: 'nav_search', icon: 'search-2' },
  { id: 'nav_songlist', icon: 'album' },
  { id: 'nav_top', icon: 'leaderboard' },
  { id: 'nav_love', icon: 'love' },
]
```

Import `ListeningTime` in the vertical settings file and add:

```tsx
case 'listening_time': return <ListeningTime />
```

- [ ] **Step 4: Expose recent plays in Recommend**

Import `useRecentPlayList`, read the list in the component, and render the existing song section after `SpecialCards`:

```tsx
const recentPlayList = useRecentPlayList()

<SongSection
  id="recent_play"
  title={t('recent_play')}
  list={recentPlayList}
/>
```

`SongSection` already limits display to eight rows while loading the full supplied list into the temp queue, so no new UI abstraction is required.

- [ ] **Step 5: Record recent play on `playerPlaying`**

Remove the import and eager call from `player.ts`. In `playerEvent.ts`, import `addRecentPlayMusic` and extend `handlePlaying`:

```ts
let recentMusicIdentity = ''

const handlePlaying = () => {
  setStatusText('')
  clearLoadingTimeout()
  const musicInfo = playerState.playMusicInfo.musicInfo
  if (!musicInfo) return
  const sourceMusicInfo = 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
  const identity = `${sourceMusicInfo.source}:${sourceMusicInfo.id}`
  if (identity == recentMusicIdentity) return
  recentMusicIdentity = identity
  addRecentPlayMusic(sourceMusicInfo)
}
```

Reset `recentMusicIdentity` in `handleSetPlayInfo` so a later replay of the same song is eligible after a track transition.

- [ ] **Step 6: Run the integration test and type check**

Run: `node --test test/integration/mobilePortWiring.test.cjs`

Run: `npx tsc --noEmit`

Expected: integration tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the focused fix**

```bash
git add src/core/player/player.ts src/core/init/player/playerEvent.ts src/screens/Home/Vertical/BottomNav.tsx src/screens/Home/Views/Setting/Vertical/Main.tsx src/screens/Home/Views/Recommend/index.tsx test/integration/mobilePortWiring.test.cjs
git commit -m "fix: restore mobile feature entry points"
```

## Task 8: Enforce WebDAV Read-Only Actions

**Files:**
- Modify: `src/screens/Home/Views/Mylist/MyList/ListMenu.tsx:68`
- Test: `test/integration/mobilePortWiring.test.cjs`

- [ ] **Step 1: Add a failing menu-boundary test**

Append:

```js
test('WebDAV list disables every mutating list-level action', () => {
  const source = read('src/screens/Home/Views/Mylist/MyList/ListMenu.tsx')
  assert.match(source, /const isWebDAVList = listInfo\.id == LIST_IDS\.WEBDAV/)
  for (const action of ['sort', 'duplicateMusic', 'import']) {
    assert.match(source, new RegExp(`action: '${action}', disabled: isWebDAVList`))
  }
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `node --test test/integration/mobilePortWiring.test.cjs`

Expected: FAIL because sort, duplicate removal, and import remain enabled for WebDAV.

- [ ] **Step 3: Disable mutating WebDAV actions**

At the start of `handleSetMenu`, define:

```ts
const isWebDAVList = listInfo.id == LIST_IDS.WEBDAV
```

Change the affected menu entries to:

```ts
{ action: 'sort', disabled: isWebDAVList, label: t('list_sort') },
{ action: 'duplicateMusic', disabled: isWebDAVList, label: t('lists__duplicate') },
{ action: 'import', disabled: isWebDAVList, label: t('list_import') },
```

Keep refresh and export enabled; both are non-mutating for the remote source.

- [ ] **Step 4: Run the integration test**

Run: `node --test test/integration/mobilePortWiring.test.cjs`

Expected: all wiring tests PASS.

- [ ] **Step 5: Commit the focused fix**

```bash
git add src/screens/Home/Views/Mylist/MyList/ListMenu.tsx test/integration/mobilePortWiring.test.cjs
git commit -m "fix: enforce webdav list read only actions"
```

## Task 9: Prevent Stale Previous-List Loads From Winning A Race

**Files:**
- Create: `src/utils/latestAsyncValue.js`
- Create: `src/utils/latestAsyncValue.d.ts`
- Modify: `src/utils/data.ts:39`
- Create: `test/utils/latestAsyncValue.test.cjs`

- [ ] **Step 1: Write the failing race test**

Create:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createLatestAsyncValue } = require('../../src/utils/latestAsyncValue.js')

test('a late storage load cannot overwrite a newer user selection', async() => {
  let resolveLoad
  const holder = createLatestAsyncValue(
    () => new Promise(resolve => { resolveLoad = resolve }),
    value => value ?? 'default',
  )
  const loading = holder.get()
  holder.set('love')
  resolveLoad('default')
  assert.equal(await loading, 'love')
  assert.equal(await holder.get(), 'love')
})
```

Also append this source-contract test to `test/integration/mobilePortWiring.test.cjs` so the deferred save captures the selected ID instead of reading a later WebDAV selection:

```js
test('previous-list persistence captures the non-WebDAV id passed to the throttle', () => {
  const source = read('src/utils/data.ts')
  assert.match(source, /throttle\(\(id: string\) => \{[\s\S]*saveData\(listPrevSelectIdKey, id\)/)
  assert.match(source, /saveListPrevSelectIdThrottle\(id\)/)
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `node --test test/utils/latestAsyncValue.test.cjs`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the latest-value holder**

Create:

```js
const createLatestAsyncValue = (load, normalize = value => value) => {
  let value
  let revision = 0
  let loadPromise = null
  return {
    async get() {
      if (value !== undefined) return value
      if (!loadPromise) {
        const loadRevision = revision
        loadPromise = Promise.resolve(load()).then(rawValue => {
          const loadedValue = normalize(rawValue)
          if (revision == loadRevision && value === undefined) value = loadedValue
          return value === undefined ? loadedValue : value
        })
      }
      return loadPromise
    },
    set(nextValue) {
      revision += 1
      value = nextValue
      loadPromise = Promise.resolve(nextValue)
    },
  }
}

module.exports = { createLatestAsyncValue }
```

Add `latestAsyncValue.d.ts`:

```ts
export function createLatestAsyncValue<T, Raw = T>(
  load: () => Promise<Raw>,
  normalize?: (value: Raw) => T,
): {
  get: () => Promise<T>
  set: (value: T) => void
}
```

- [ ] **Step 4: Use it for previous-list selection**

Replace `listPrevSelectIdInitPromise` with:

```ts
const listPrevSelectIdValue = createLatestAsyncValue(
  () => getData<string>(listPrevSelectIdKey),
  id => id == LIST_IDS.WEBDAV ? LIST_IDS.DEFAULT : id ?? LIST_IDS.DEFAULT,
)
```

Change the throttled persistence function so it captures the ID at scheduling time:

```ts
const saveListPrevSelectIdThrottle = throttle((id: string) => {
  void saveData(listPrevSelectIdKey, id)
}, 200)
```

Implement the accessors as:

```ts
export const getListPrevSelectId = async() => {
  listPrevSelectId = await listPrevSelectIdValue.get()
  return listPrevSelectId || LIST_IDS.DEFAULT
}

export const saveListPrevSelectId = (id: string) => {
  listPrevSelectId = id
  listPrevSelectIdValue.set(id)
  if (id == LIST_IDS.WEBDAV) return
  saveListPrevSelectIdThrottle(id)
}
```

- [ ] **Step 5: Run focused tests and type check**

Run: `node --test test/utils/latestAsyncValue.test.cjs test/integration/mobilePortWiring.test.cjs`

Run: `npx tsc --noEmit`

Expected: race test PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the focused fix**

```bash
git add src/utils/latestAsyncValue.js src/utils/latestAsyncValue.d.ts src/utils/data.ts test/utils/latestAsyncValue.test.cjs
git commit -m "fix: keep latest list selection during storage init"
```

## Task 10: Apply The Non-Breaking Dependency Security Update

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Capture the current advisory**

Run: `npm audit --omit=dev --registry=https://registry.npmjs.org`

Expected: report includes `@babel/core <=7.29.0` and the transitive `fast-xml-parser <5.7.0` advisory.

- [ ] **Step 2: Update Babel within major version 7**

Run: `npm install --save-dev @babel/core@^7.29.7 --registry=https://registry.npmjs.org`

Expected: `package.json` uses `^7.29.7` and the lock resolves a patched 7.x version.

- [ ] **Step 3: Re-run the security audit**

Run: `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org`

Expected: exit 0 with no high/critical vulnerabilities. The remaining `fast-xml-parser` moderate advisory is documented as deferred because the available automatic fix upgrades React Native to 0.86, outside this audit's compatibility boundary.

- [ ] **Step 4: Verify dependency consistency**

Run: `npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org`

Expected: exit 0 and a second run produces no additional lockfile changes.

- [ ] **Step 5: Commit the focused update**

```bash
git add package.json package-lock.json
git commit -m "chore: update patched babel core"
```

## Task 11: Full Regression And Build Verification

**Files:**
- Review all files changed in Tasks 1-10.
- Do not hand-edit `index.android.bundle`; regenerate it only through the repository build command if the user wants the generated artifact refreshed.

- [ ] **Step 1: Run all logic tests**

Run: `npm run test:logic`

Expected: every Node test passes, including all newly added regression files.

- [ ] **Step 2: Run static checks**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0; the existing `baseline-browser-mapping` age notice may remain.

- [ ] **Step 3: Run dependency and whitespace checks**

Run: `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org`

Expected: exit 0 with no high/critical advisories.

Run: `git diff --check`

Expected: no whitespace errors; Windows line-ending conversion warnings may remain.

- [ ] **Step 4: Build the JavaScript bundle**

Run: `npm run build-test`

Expected: Metro produces `index.android.bundle` successfully with no module-resolution error.

- [ ] **Step 5: Build an Android debug APK**

Run from `android`: `./gradlew assembleDebug`

Expected: `BUILD SUCCESSFUL`. If the installed JDK, Android SDK, or network prevents the build, record the exact environmental error and retain the successful Metro/type/test evidence.

- [ ] **Step 6: Inspect the final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- src test package.json package-lock.json
```

Expected: only planned fixes plus the user's pre-existing changes are present; no generated or unrelated file is accidentally reverted.

- [ ] **Step 7: Produce the audit report**

Report each fixed issue with priority, root cause, file reference, regression test, and verification result. List the transitive `fast-xml-parser` advisory and any unavailable device/emulator smoke test under residual risk.
