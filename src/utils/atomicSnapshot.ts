import { getData, saveData } from '@/plugins/storage'

// SQLite commits the complete value atomically; the legacy generation pointer is
// resolved by the one-time database migration before any reader is enabled.
export const createAtomicSnapshot = <T>(key: string) => {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    async read(): Promise<T | null> { await tail; return getData<T>(key) },
    async write(value: T) {
      const copy: T = JSON.parse(JSON.stringify(value))
      const operation = tail.catch(() => {}).then(async() => saveData(key, copy))
      tail = operation.catch(() => {})
      await operation
    },
  }
}
