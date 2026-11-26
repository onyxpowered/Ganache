import { ref as Ref, set as Set, remove as Remove } from 'firebase/database'
import { Width, Height, Rate, Path, Text } from './Wire.js'

export const Send = async ({ Links, Id, Track, Pulse, Fill }) => {
  const Source = document.createElement('video')
  Source.muted = true
  Source.srcObject = new MediaStream([Track])
  await Promise.race([Source.play(), new Promise((Done, Fail) => setTimeout(() => Fail(new Error('No video from the screen')), 6000))])

  const Canvas = new OffscreenCanvas(Width, Height)
  const Context = Canvas.getContext('2d', { alpha: false })
  Context.imageSmoothingEnabled = true
  Context.imageSmoothingQuality = 'high'
  const Busy = Links.map(() => false)
  const Acks = Links.map(() => 0)
  const Gap = 1000 / Rate
  let Seq = Date.now()
  let Quality = 0.74
  let Last = ''
  let Beat = 0
  let Quiet = 0
  let Alive = true
  let Working = false

  const Pick = () => {
    let Best = -1
    for (let Index = 0; Index < Links.length; Index++) {
      if (Busy[Index]) continue
      if (Best < 0 || Acks[Index] < Acks[Best]) Best = Index
    }
    return Best
  }

  const Lower = () => {
    Quiet = 0
    Quality = Math.max(0.42, Quality - 0.05)
  }

  const Raise = () => {
    Quiet++
    if (Quiet > 30) {
      Quiet = 0
      Quality = Math.min(0.9, Quality + 0.02)
    }
  }

  const Frame = async () => {
    if (Working) return
    const Slot = Pick()
    if (Slot < 0) return Lower()
    Working = true
    Busy[Slot] = true
    try {
      const Sw = Source.videoWidth || Width
      const Sh = Source.videoHeight || Height
      const Cover = Fill ? Fill() : false
      const Fit = Cover ? Math.max(Width / Sw, Height / Sh) : Math.min(Width / Sw, Height / Sh)
      const Dw = Math.round(Sw * Fit)
      const Dh = Math.round(Sh * Fit)
      if (!Cover && (Dw !== Width || Dh !== Height)) {
        Context.fillStyle = '#000'
        Context.fillRect(0, 0, Width, Height)
      }
      Context.drawImage(Source, Math.round((Width - Dw) / 2), Math.round((Height - Dh) / 2), Dw, Dh)
      const Blob = await Canvas.convertToBlob({ type: 'image/jpeg', quality: Quality })
      const Data = await Text(Blob)
      const Now = performance.now()
      if (Data === Last && Now - Beat < 1000) {
        Busy[Slot] = false
        return
      }
      Last = Data
      Beat = Now
      Seq++
      const Link = Links[Slot]
      Set(Ref(Link.Db, Path(Id, 'V', Link.Index)), { Seq, Data })
        .then(() => {
          Acks[Slot] = Acks[Slot] * 0.8 + (performance.now() - Now) * 0.2
          Busy[Slot] = false
          if (Pulse) Pulse()
          Raise()
        })
        .catch(() => {
          Busy[Slot] = false
          Acks[Slot] += 500
        })
    } catch {
      Busy[Slot] = false
    } finally {
      Working = false
    }
  }

  const Loop = async () => {
    if (!Alive) return
    const Start = performance.now()
    await Frame()
    setTimeout(Loop, Math.max(0, Gap - (performance.now() - Start)))
  }

  Loop()

  return () => {
    Alive = false
    Source.pause()
    Source.srcObject = null
    Links.forEach((Link) => {
      Remove(Ref(Link.Db, `S/${Id}/V`)).catch(() => {})
      Remove(Ref(Link.Db, `S/${Id}/A`)).catch(() => {})
    })
  }
}
