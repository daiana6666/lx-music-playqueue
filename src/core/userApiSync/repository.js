// Script generations are immutable; only the small catalog pointer is committed.
const createUserApiRepository = ({ snapshot, loadLegacy, readScript, writeScript, removeScript, createKey }) => {
  let state
  let initialized
  let tail = Promise.resolve()
  const init = async() => {
    initialized ??= (async() => { state = await snapshot.read() ?? await loadLegacy() })().catch(error => { initialized = undefined; throw error })
    await initialized
  }
  const enqueue = operation => {
    const result = tail.catch(() => {}).then(async() => { await init(); return operation() })
    tail = result
    return result
  }
  const clone = value => JSON.parse(JSON.stringify(value))
  return {
    getList: () => enqueue(() => clone(state.apis)),
    getScript: id => enqueue(() => state.scripts[id] ? readScript(state.scripts[id]) : ''),
    readAll: () => enqueue(async() => Promise.all(state.apis.map(async api => ({ ...clone(api), script: await readScript(state.scripts[api.id]) })))),
    mutate: build => enqueue(async() => {
      const { nextApis, scriptsToSave = [] } = build(clone(state.apis))
      const scripts = { ...state.scripts }
      const staged = []
      try {
        for (const [id, script] of scriptsToSave) {
          const key = createKey(id)
          staged.push(key)
          await writeScript(key, script)
          scripts[id] = key
        }
        const nextScripts = Object.fromEntries(nextApis.map(api => [api.id, scripts[api.id]]))
        const next = { apis: nextApis, scripts: nextScripts }
        await snapshot.write(next)
        const oldScripts = Object.values(state.scripts)
        state = next
        const retained = new Set(Object.values(nextScripts))
        for (const key of oldScripts) {
          if (!retained.has(key) && key.includes(':generation:')) await removeScript(key).catch(() => {})
        }
        return clone(nextApis)
      } catch (error) {
        for (const key of staged) await removeScript(key).catch(() => {})
        throw error
      }
    }),
  }
}
module.exports = { createUserApiRepository }
