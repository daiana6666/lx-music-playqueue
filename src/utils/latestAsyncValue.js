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
