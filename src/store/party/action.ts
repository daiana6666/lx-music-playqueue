import state from './state'

export default {
  setRoom(room: LX.Party.RoomSnapshot | null) {
    state.room = room
    global.state_event.partyRoomUpdated(room)
  },
}
