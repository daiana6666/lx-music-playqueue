import { useEffect, useState } from 'react'
import state from './state'

const getStateSnapshot = () => ({
  ...state,
  loadingSections: { ...state.loadingSections },
  loadedSections: { ...state.loadedSections },
})

export const useRecommendHome = () => {
  const [value, update] = useState(state.homeRecommendation)

  useEffect(() => {
    global.state_event.on('recommendHomeUpdated', update)
    return () => {
      global.state_event.off('recommendHomeUpdated', update)
    }
  }, [])

  return value
}

export const useRecommendHomeState = () => {
  const [value, update] = useState(getStateSnapshot)

  useEffect(() => {
    const handleUpdate = () => {
      update(getStateSnapshot())
    }
    global.state_event.on('recommendHomeUpdated', handleUpdate)
    return () => {
      global.state_event.off('recommendHomeUpdated', handleUpdate)
    }
  }, [])

  return value
}

export const getRecommendHomeState = () => state
