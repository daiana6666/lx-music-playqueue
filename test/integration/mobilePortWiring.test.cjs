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
  const handlePlaying = playerEvent.slice(
    playerEvent.indexOf('const handlePlaying'),
    playerEvent.indexOf('const handleEmpied'),
  )
  assert.match(recommend, /useRecentPlayList\(\)/)
  assert.match(recommend, /title=\{t\('recent_play'\)\}/)
  assert.doesNotMatch(player, /addRecentPlayMusic\(/)
  assert.match(handlePlaying, /addRecentPlayMusic\(/)
})

test('WebDAV list disables every mutating list-level action', () => {
  const source = read('src/screens/Home/Views/Mylist/MyList/ListMenu.tsx')
  assert.match(source, /const isWebDAVList = listInfo\.id == LIST_IDS\.WEBDAV/)
  for (const action of ['sort', 'duplicateMusic', 'import']) {
    assert.match(source, new RegExp(`action: '${action}', disabled: isWebDAVList`))
  }
})

test('previous-list persistence captures the non-WebDAV id passed to the throttle', () => {
  const source = read('src/utils/data.ts')
  assert.match(source, /throttle\(\(id: string\) => \{[\s\S]*saveData\(listPrevSelectIdKey, id\)/)
  assert.match(source, /saveListPrevSelectIdThrottle\(id\)/)
})
