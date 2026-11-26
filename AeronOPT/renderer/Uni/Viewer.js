import { ref as Ref, onValue as OnValue } from 'firebase/database'
import { Path } from './Wire.js'
import { Open } from './Link.js'

export const Watch = async ({ Id, Canvas, Links, Seen }) => {
  const Live = Links || (await Open())
  const Context = Canvas.getContext('2d', { alpha: false })
  let Shown = 0
  let Pending = null
  let Painting = false

  const Paint = async () => {
    if (Painting) return
    Painting = true
    while (Pending) {
      const Frame = Pending
      Pending = null
      if (Frame.Seq <= Shown) continue
      const Picture = new Image()
      Picture.src = Frame.Data
      try {
        await Picture.decode()
      } catch {
        continue
      }
      if (Frame.Seq <= Shown) continue
      Context.drawImage(Picture, 0, 0, Canvas.width, Canvas.height)
      Shown = Frame.Seq
      if (Seen) Seen()
    }
    Painting = false
  }

  const Stops = Live.map((Link) =>
    OnValue(Ref(Link.Db, Path(Id, 'V', Link.Index)), (Snap) => {
      const Frame = Snap.val()
      if (!Frame || Frame.Seq <= Shown) return
      if (!Pending || Frame.Seq > Pending.Seq) Pending = Frame
      Paint()
    })
  )

  return { Links: Live, Stop: () => Stops.forEach((Stop) => Stop()) }
}
