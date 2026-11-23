import { useEffect, useState } from 'react'
import state from './state'

export const useListeningTimeStats = () => {
  const [value, update] = useState(state.listeningTimeStats)

  useEffect(() => {
    global.state_event.on('listeningTimeStatsUpdated', update)
    return () => {
      global.state_event.off('listeningTimeStatsUpdated', update)
    }
  }, [])

  return value
}
