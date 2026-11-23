import { useEffect, useState } from 'react'
import state from './state'

export const useNeteaseAccountStatus = () => {
  const [value, update] = useState(state.accountStatus)

  useEffect(() => {
    global.state_event.on('neteaseAccountStatusUpdated', update)
    return () => {
      global.state_event.off('neteaseAccountStatusUpdated', update)
    }
  }, [])

  return value
}
