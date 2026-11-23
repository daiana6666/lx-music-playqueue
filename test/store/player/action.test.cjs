const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const actionSource = fs.readFileSync(path.join(__dirname, '../../../src/store/player/action.ts'), 'utf8')

test('player queue events publish array copies', () => {
  assert.match(actionSource, /playPlayedListChanged\(\[\s*\.\.\.state\.playedList\s*\]\)/)
  assert.doesNotMatch(actionSource, /playPlayedListChanged\(\{\s*\.\.\.state\.playedList\s*\}\)/)

  assert.match(actionSource, /playTempPlayListChanged\(\[\s*\.\.\.state\.tempPlayList\s*\]\)/)
  assert.doesNotMatch(actionSource, /playTempPlayListChanged\(\{\s*\.\.\.state\.tempPlayList\s*\}\)/)
})
