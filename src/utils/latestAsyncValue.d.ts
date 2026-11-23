export function createLatestAsyncValue<T, Raw = T>(
  load: () => Promise<Raw>,
  normalize?: (value: Raw) => T,
): {
  get: () => Promise<T>
  set: (value: T) => void
}
