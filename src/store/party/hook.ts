import { useEffect, useState } from 'react'
import state from './state'

export const usePartyRoom = () => {
  const [value, update] = useState(state.room)

  useEffect(() => {
    global.state_event.on('partyRoomUpdated', update)
    return () => {
      global.state_event.off('partyRoomUpdated', update)
    }
  }, [])

  return value
}
