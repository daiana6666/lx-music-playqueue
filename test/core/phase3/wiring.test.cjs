const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('../../helpers/load-ts-module.cjs')

test('player startup restores statistics before allowing a saved track to start a session', async() => {
  const order = []
  global.lx = { fontSize: 1 }
  const init = load('src/core/init/index.ts', {
    '@/core/common': { initSetting: async() => ({ 'common.apiSource': '' }), showPactModal() {} },
    '@/plugins/player/service': () => {},
    './theme': async() => {}, './i18n': async() => {}, './userApi': async() => {},
    './player': async() => { assert.deepEqual(order, ['statistics', 'history']); order.push('player') },
    './dataInit': async() => {}, './sync': async() => {}, './common': async() => {},
    './deeplink': { initDeeplink() {} }, '@/core/apiSource': { setApiSource() {} },
    '@/store/common/action': { setFontSize() {} }, '@/store/setting/state': { setting: {} },
    '@/utils/bootLog': { bootLog() {} }, '@/utils/tools': { cheatTip() {} },
    '@/store/listeningTime/action': { initListeningTimeStats: async() => { order.push('statistics') } },
    '@/store/recentPlay/action': { initRecentPlayList: async() => { order.push('history') } },
  }).default
  await init()
  assert.deepEqual(order, ['statistics', 'history', 'player'])
})
test('actual player state accepts reported quality and clears it after source/song changes', () => {
  const state = load('src/store/player/state.ts').default
  global.state_event = { playerMusicInfoChanged() {} }
  const action = load('src/store/player/action.ts', {
    './state': state, '@/utils': { arrPush() {}, arrUnshift() {}, formatPlayTime2: String },
  }).default
  action.setMusicInfo({ quality: '128k', qualityVerified: true })
  assert.equal(state.musicInfo.quality, '128k')
  assert.equal(state.musicInfo.qualityVerified, true)
  action.setMusicInfo({ quality: null, qualityVerified: false })
  assert.equal(state.musicInfo.quality, null)
})
