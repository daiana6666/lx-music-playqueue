# Desktop Feature Mobile Port Design

Date: 2026-05-31
Project: `D:\projects\lx-music-mobile`
Source change document: `D:\projects\lx-music-desktop\doc\MOBILE_PORTING_CHANGES.md`

## Goal

Port the customized desktop project features into the React Native mobile app while preserving the desktop behavior that matters and adapting platform-specific UI to mobile. The mobile app must cover the full feature set from the desktop change document, with Electron-only and Windows-only features represented by mobile equivalents or explicitly marked as not applicable.

## Existing Mobile Context

The mobile app is React Native with `react-native-navigation`. The home screen uses internal `nav_*` tabs, currently search, playlists, leaderboard, my list, and settings. Online playlist detail already has a reusable `SonglistDetail` screen and `core/songlist.ts` cache layer. Playback already uses temporary lists, source switching, and a unified music identity pattern based on `source:id`.

The current worktree already contains user changes for WebDAV, party sync, playbar styling, list UI, and related type additions. The port will preserve these changes and build on them.

CodeGraph could not be initialized because the CLI is unavailable in the environment, so exploration used focused project reads and `rg`.

## Feature Coverage

Direct mobile ports:

- WY account data, login state, QR login, logout, and account profile UI.
- WY service APIs for recommendation data, private FM, daily recommendations, playlist detail, daily song categories, like sync, `fm_trash`, and optional song URL.
- Recommendation home page with daily recommendation, private FM, private radar, radar playlists, style songs, daily song category playlists, similar songs, recommended playlists, charts, and view-all playlists.
- Recommendation page cache, scroll restoration, and section-level refresh.
- WY playlist detail and virtual playlist detail for daily recommendations and daily song categories.
- Playback fallback where WY recommendation metadata is matched to existing LX playable sources before direct WY playback.
- Favorite sync from the mobile loved list to WY like for WY songs.
- Recent play list with a 520 item cap.
- Listening time statistics.
- Recommendation settings for home section order and daily song category tag selection/order.
- i18n text for new mobile UI.
- README/doc updates for mobile features.

Mobile equivalents:

- Desktop account avatar popover becomes mobile header avatar plus bottom sheet/modal.
- Desktop play queue panel becomes a mobile bottom sheet or modal exposed from the player controls.
- Desktop tray menu becomes player/notification-style quick controls where mobile APIs allow it.
- Desktop lyric line height/padding settings become mobile lyric display settings.
- Desktop list/sidebar/profile scaling becomes mobile list density and playlist header density settings.

Not applicable on mobile, but documented:

- Electron build scripts and Windows portable/7z packaging.
- Electron main process IPC and renderer process wiring.
- Windows custom tray HTML window.
- Window size, draggable toolbar/no-drag behavior, taskbar positioning, and Electron desktop lyric window placement.

## Architecture

### WY Service

Create a mobile-native WY service under `src/core/netease`.

It will use existing React Native request primitives and mobile WY SDK crypto helpers instead of the desktop Node enhanced API package. This avoids bundling a Node-only dependency into React Native. The service API mirrors the desktop renderer IPC surface:

- `getAccountStatus`
- `createLoginQr`
- `checkLoginQr`
- `logout`
- `getRecommendSongs`
- `getPrivateFm`
- `getRecommendPlaylists`
- `getHomeRecommendation`
- `getDailySongCategories`
- `getPlaylistDetail`
- `getMusicUrl`
- `likeMusic`
- `trashPrivateFmMusic`

Account state is persisted through the mobile storage helper in `src/utils/data.ts` using a new storage key. The stored shape is:

```ts
interface NeteaseAccountData {
  cookie: string
  profile: LX.Netease.Profile | null
  updatedAt: number
}
```

Login status reuses the desktop five-minute profile cache rule to avoid repeated status requests.

### Types And Settings

Add mobile `LX.Netease.*` types and extend `LX.Music.MusicInfoMetaBase` with optional recommendation metadata such as `recommendTag`. Add:

- `recommend.homeSectionOrder`
- `recommend.dailySongCategoryTagKeys`
- `list.myListSidebarScale`, interpreted on mobile as my-list density/scale
- `list.playlistProfileScale`, interpreted on mobile as playlist header density/scale
- `listeningTimeStats` storage key
- `neteaseAccount` storage key
- `recentPlayList` storage key

Recommendation section IDs are shared constants in mobile config.

### Recommendation Store

Create focused state/actions for:

- WY account status.
- Recommendation home cache.
- Daily recommend list.
- Private FM queue and mode.
- Recent play list.
- Listening time stats.

The recommendation home cache is keyed by login state and selected daily song tag keys. It does not expire by default, matching the desktop `RECOMMEND_CACHE_TTL = Infinity` behavior, and refreshes only on explicit page/section refresh or relevant setting changes.

### Navigation

Add `nav_recommend` as a first-class home tab. On portrait/mobile bottom navigation, recommended order is:

1. Recommend
2. Search
3. Playlists
4. Charts
5. Mine

On drawer/horizontal navigation, use the same logical entry while preserving existing layout patterns.

### Recommendation UI

The recommendation screen is mobile-first:

- Top account strip with avatar, nickname or login prompt, and QR login modal/bottom sheet.
- Search affordance near the top, reusing existing search navigation rather than building a new search engine.
- Horizontal special cards for Daily Recommend, Private FM, and Private Radar.
- Section cards/lists for radar playlists, style songs, daily song category playlists, similar songs, recommended playlists, and charts.
- Horizontal carousels use `FlatList`/`ScrollView`; desktop arrows are omitted.
- Section refresh controls are icon buttons.
- Song sections use compact mobile song rows with love buttons and play-all controls.
- Private FM can be started from the card and later enhanced with a dedicated FM view.

The UI should stay dense and music-player focused, not a marketing-style landing page.

### Playlist Detail

`core/songlist.ts` gains a WY branch:

- Normal WY playlists call the new WY playlist detail service.
- Daily recommend virtual IDs call the daily recommend detail action.
- Daily song category virtual IDs call the daily category detail action.

Virtual playlists are not sent to the ordinary SDK playlist detail endpoint.

### Playback

Preserve the desktop design conclusion:

WY provides recommendation metadata, not the preferred playback source.

Playback flow:

1. If a WY music item has a cached `meta.toggleMusicInfo`, try it first.
2. Otherwise search existing LX project sources by name, singer, album, and interval.
3. Use the first playable non-WY source that is supported by the current app source configuration.
4. Cache the matched music in `meta.toggleMusicInfo`.
5. Fall back to the normal online URL path only when needed.

This keeps recommendation playback compatible with the app's source system and avoids relying on expiring WY URLs.

### Private FM

Private FM is a playback mode, not a normal playlist. Mobile state tracks:

- current FM mode
- queue
- loading status
- whether the active player list is the FM temp list

When the app leaves the FM temp list, FM mode exits. When the current queue nears the end, the queue appends more FM songs. `fm_trash` is exposed as a reduce-recommendation action.

### Favorites And Recent Play

When adding WY songs to the loved list, call `likeMusic` after local add succeeds. Cancel-like sync is not required in the first pass unless existing desktop behavior is later changed.

Recent play stores the latest 520 unique songs by `source:id`. It updates on real playback changes and persists through mobile storage.

### Listening Time

Listening time stats are updated only while real playback progresses. Pausing, seeking, or changing songs must not double count time. Stats are persisted with throttling and displayed in Settings or Mine:

- total time
- today
- this week
- song count
- recent seven-day chart
- top songs

### Settings

Add a recommendation settings section:

- Reorder recommendation home sections.
- Reset section order.
- Load daily song category tags.
- Select, clear, reset, and reorder selected tags.

Add mobile density controls for list/profile display, plus lyric display spacing controls where the mobile lyric UI supports them.

Hide or skip desktop software update/change-log settings that do not apply to this mobile app release channel.

## Data Flow

Recommendation page load:

1. Initialize WY account status.
2. Load cached home recommendation if valid.
3. If missing, request core sections first.
4. Load charts and warm-up data in background.
5. Restore scroll position when returning from detail pages.

Special card playback:

- Daily recommend: load daily songs, set temp list, play.
- Private FM: prepare FM queue, set FM temp list, play without refreshing if currently paused.
- Private radar: load playlist detail into temp list and play.

Playlist open:

- Recommendation card passes source `wy` and ID to existing `SonglistDetail`.
- The detail layer detects virtual IDs before normal detail calls.

## Error Handling

Network and API errors show concise mobile toasts or inline section error text. Section refresh errors do not clear other sections. Login expiry resets account status but keeps cached public recommendations when possible. WY source match failures surface a clearer message and leave the item available for retry.

## Testing

The repository currently has no obvious Jest/Vitest setup. Add a lightweight pure-logic test command before production code for the new framework-neutral helpers, using Node's built-in test runner where possible. UI and React Native integration behavior will be verified with type checks, linting, and bundle/build smoke tests because the app has no established RN component test harness.

- TypeScript check via `npx tsc --noEmit`.
- ESLint on touched files or whole project if feasible.
- Focused manual verification through React Native bundle/build commands where practical.

Pure units worth testing:

- daily song category ID/tag parsing
- recommendation section order normalization/move
- recent play de-duplication and cap
- listening time accumulation
- WY normalization helpers

## Implementation Notes

Use `apply_patch` for source edits. Do not revert existing dirty worktree changes. Keep files focused and reuse mobile components such as `OnlineList`, `SonglistDetail`, `PlayerBar`, `Section`, `CheckBoxItem`, and existing theme hooks.

The first implementation pass should prioritize the main chain:

login -> recommendation -> playlist detail -> playback fallback -> loved sync

Then add settings, recent play, listening time, and mobile equivalents for desktop-only features.
