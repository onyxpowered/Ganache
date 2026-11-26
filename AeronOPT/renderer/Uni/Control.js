import { ref as Ref, set as Set, remove as Remove, onValue as OnValue } from 'firebase/database'
import { Path } from './Wire.js'

let Last = 0

const Next = () => {
  Last = Math.max(Last + 1, Date.now())
  return Last
}

export const Publish = (Links, Id, Kind, Value) => {
  const Seq = Next()
  const Data = JSON.stringify(Value)
  Links.forEach((Link) => Set(Ref(Link.Db, Path(Id, Kind, Link.Index)), { Seq, Data }).catch(() => {}))
}

export const Clear = (Links, Id, Kind) =>
  Links.forEach((Link) => Remove(Ref(Link.Db, Path(Id, Kind, Link.Index))).catch(() => {}))

export const Listen = (Links, Id, Kind, Callback) => {
  const Seen = new Map()
  let Newest = 0
  const Stops = Links.map((Link) =>
    OnValue(Ref(Link.Db, Path(Id, Kind, Link.Index)), (Snap) => {
      const Packet = Snap.val()
      Seen.set(Link.Index, Packet ? Packet.Seq : 0)
      if (!Packet) {
        if (Newest !== 0 && [...Seen.values()].every((Value) => Value === 0)) {
          Newest = 0
          Callback(null)
        }
        return
      }
      if (Packet.Seq <= Newest) return
      Newest = Packet.Seq
      Callback(JSON.parse(Packet.Data))
    })
  )
  return () => Stops.forEach((Stop) => Stop())
}
