const test = require('node:test')
const assert = require('node:assert/strict')

const { appendUniqueMusicInfos } = require('../../../src/store/privateFm/helpers.js')

test('private FM queue appends new songs without duplicating source identities', () => {
  const current = [
    { id: 'wy_1', source: 'wy' },
    { id: 'wy_2', source: 'wy' },
  ]
  const next = [
    { id: 'wy_2', source: 'wy' },
    { id: 'wy_3', source: 'wy' },
    { id: 'wy_1', source: 'tx' },
  ]

  const result = appendUniqueMusicInfos(current, next)
  assert.deepEqual(result.map(item => `${item.source}:${item.id}`), [
    'wy:wy_1',
    'wy:wy_2',
    'wy:wy_3',
    'tx:wy_1',
  ])
  assert.notEqual(result, current)
})
