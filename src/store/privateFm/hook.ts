import { useEffect, useState } from 'react'
import state, { type InitState } from './state'

export const usePrivateFmState = () => {
  const [value, update] = useState<InitState>({ ...state })

  useEffect(() => {
    global.state_event.on('privateFmUpdated', update)
    return () => {
      global.state_event.off('privateFmUpdated', update)
    }
  }, [])

  return value
}
