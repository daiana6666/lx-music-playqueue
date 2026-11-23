const createListeningTimeTracker = () => {
  let lastPosition = 0
  let carrySeconds = 0
  let longGapAllowed = false

  return {
    reset(position = 0) {
      lastPosition = Number(position) || 0
      carrySeconds = 0
      longGapAllowed = false
    },
    allowLongGap() {
      longGapAllowed = true
    },
    update(position, playbackRate = 1) {
      const nextPosition = Number(position) || 0
      const delta = nextPosition - lastPosition
      lastPosition = nextPosition
      const allowLongGap = longGapAllowed
      longGapAllowed = false
      if (delta <= 0 || (delta > 5 && !allowLongGap)) return 0
      carrySeconds += delta / Math.max(0.1, Number(playbackRate) || 1)
      const seconds = Math.floor(carrySeconds)
      carrySeconds -= seconds
      return seconds
    },
  }
}

module.exports = { createListeningTimeTracker }
