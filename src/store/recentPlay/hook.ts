import { useEffect, useState } from 'react'
import state from './state'

export const useRecentPlayList = () => {
  const [value, update] = useState(state.recentPlayList)

  useEffect(() => {
    global.state_event.on('recentPlayListUpdated', update)
    return () => {
      global.state_event.off('recentPlayListUpdated', update)
    }
  }, [])

  return value
}
