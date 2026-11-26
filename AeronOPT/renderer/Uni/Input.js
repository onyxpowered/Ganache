import { ref as Ref, set as Put } from 'firebase/database'
import { Path, Width, Height } from './Wire.js'

const Age = 400
const Limit = 64

export const Control = ({ Links, Id, Canvas, Notice }) => {
  const Busy = Links.map(() => false)
  const Acks = Links.map(() => 0)
  const Down = new Set()
  const Held = new Set()
  let Log = []
  let Seq = Date.now()
  let Dirty = false
  let Planned = false
  let Locked = false
  let Counter = Date.now()

  const Pick = () => {
    let Best = -1
    for (let Index = 0; Index < Links.length; Index++) {
      if (Busy[Index]) continue
      if (Best < 0 || Acks[Index] < Acks[Best]) Best = Index
    }
    return Best
  }

  const Flush = () => {
    Planned = false
    if (!Dirty) return
    const Slot = Pick()
    if (Slot < 0) return
    const Now = performance.now()
    Log = Log.filter((Entry) => Now - Entry.Time < Age).slice(-Limit)
    const Events = Log.map((Entry) => {
      Entry.Sent = true
      return Entry.Body
    })
    Dirty = false
    Busy[Slot] = true
    Counter = Math.max(Counter + 1, Date.now())
    const Link = Links[Slot]
    Put(Ref(Link.Db, Path(Id, 'I', Link.Index)), { Seq: Counter, Data: JSON.stringify(Events) })
      .then(() => {
        Acks[Slot] = Acks[Slot] * 0.8 + (performance.now() - Now) * 0.2
      })
      .catch(() => {
        Acks[Slot] += 500
      })
      .finally(() => {
        Busy[Slot] = false
        if (Dirty) Kick()
      })
  }

  const Kick = () => {
    Dirty = true
    if (Planned) return
    Planned = true
    queueMicrotask(Flush)
  }

  const Add = (Body, Merge) => {
    const Last = Log[Log.length - 1]
    if (Merge && Last && !Last.Sent && Last.Body.T === Body.T) {
      Merge(Last.Body, Body)
      Last.Time = performance.now()
    } else {
      Seq += 1
      Log.push({ Body: { S: Seq, ...Body }, Time: performance.now(), Sent: false })
    }
    Kick()
  }

  const Frame = () => {
    const Box = Canvas.getBoundingClientRect()
    const Scale = Math.min(Box.width / Width, Box.height / Height)
    return { Box, Scale, Ox: (Box.width - Width * Scale) / 2, Oy: (Box.height - Height * Scale) / 2 }
  }

  const Aim = (Event) => {
    const { Box, Scale, Ox, Oy } = Frame()
    const U = (Event.clientX - Box.left - Ox) / (Width * Scale)
    const V = (Event.clientY - Box.top - Oy) / (Height * Scale)
    return { U: Math.min(1, Math.max(0, U)), V: Math.min(1, Math.max(0, V)) }
  }

  const Active = () => !Canvas.hidden

  // Ask the browser on every move instead of trusting a flag set by pointerlockchange (missed on some ChromeOS builds).
  const Held$ = () => Boolean(document.pointerLockElement)

  const Move = (Event) => {
    if (!Active()) return
    Locked = Held$()
    if (Locked) {
      const { Scale } = Frame()
      const X = Event.movementX / Scale
      const Y = Event.movementY / Scale
      Add({ T: 'd', X, Y }, (Old) => {
        Old.X += X
        Old.Y += Y
      })
      return
    }
    const { U, V } = Aim(Event)
    Add({ T: 'm', U, V }, (Old) => {
      Old.U = U
      Old.V = V
    })
  }

  const Button = (Event, State) => {
    if (!Active() || Event.button > 2) return
    // Plain lock, synchronously inside the click: option variants are unsupported on macOS and a retry loses the gesture.
    if (State && !Held$()) {
      if (!Canvas.requestPointerLock) {
        if (Notice) Notice('This browser cannot lock the mouse. Use Chrome or Edge on a computer.')
      } else {
        try {
          const Asked = Canvas.requestPointerLock()
          if (Asked && Asked.catch) Asked.catch((Error) => Notice && Notice(`Mouse lock blocked: ${Error.name}. Click the stream again.`))
        } catch (Error) {
          if (Notice) Notice(`Mouse lock blocked: ${Error.name}`)
        }
      }
    }
    const Number = Event.button === 2 ? 1 : Event.button === 1 ? 2 : 0
    if (State) {
      Held.add(Number)
      if (!Held$()) {
        const { U, V } = Aim(Event)
        Add({ T: 'm', U, V })
      }
    } else Held.delete(Number)
    Add({ T: 'b', N: Number, D: State ? 1 : 0 })
    Event.preventDefault()
  }

  const Wheel = (Event) => {
    if (!Active()) return
    Event.preventDefault()
    const Scale = Event.deltaMode === 1 ? 16 : 1
    const X = Event.deltaX * Scale
    const Y = Event.deltaY * Scale
    Add({ T: 'w', X, Y }, (Old) => {
      Old.X += X
      Old.Y += Y
    })
  }

  const Key = (Event, State) => {
    if (!Active()) return
    if (Event.code === 'F8' || (Event.code === 'Backquote' && Event.ctrlKey)) {
      if (State && !Event.repeat) {
        if (Locked) document.exitPointerLock()
        else Canvas.requestPointerLock()
      }
      Event.preventDefault()
      return
    }
    Event.preventDefault()
    if (State) Down.add(Event.code)
    else Down.delete(Event.code)
    Add({ T: 'k', C: Event.code, D: State ? 1 : 0 })
  }

  const Release = () => {
    for (const Code of Down) Add({ T: 'k', C: Code, D: 0 })
    for (const Number of Held) Add({ T: 'b', N: Number, D: 0 })
    Down.clear()
    Held.clear()
  }

  const Lock = () => {
    const Was = Locked
    Locked = document.pointerLockElement === Canvas
    if (Was && !Locked) Release()
    if (Notice) Notice(Locked ? 'Mouse locked. Press Esc to release.' : 'Mouse released. Click the stream to lock it.')
  }

  const Refused = () => Notice && Notice('Mouse lock refused by the browser. Click the stream again.')
  const Context = (Event) => Event.preventDefault()
  const KeyDown = (Event) => Key(Event, true)
  const KeyUp = (Event) => Key(Event, false)
  const MouseDown = (Event) => Button(Event, true)
  const MouseUp = (Event) => Button(Event, false)
  const Hidden = () => document.hidden && Release()

  window.addEventListener('mousemove', Move)
  window.addEventListener('mousedown', MouseDown)
  window.addEventListener('mouseup', MouseUp)
  window.addEventListener('wheel', Wheel, { passive: false })
  window.addEventListener('keydown', KeyDown)
  window.addEventListener('keyup', KeyUp)
  window.addEventListener('blur', Release)
  window.addEventListener('contextmenu', Context)
  document.addEventListener('visibilitychange', Hidden)
  document.addEventListener('pointerlockchange', Lock)
  document.addEventListener('pointerlockerror', Refused)
  if (Notice) Notice('Control is on. Click the stream to lock the mouse.')

  return () => {
    Release()
    Flush()
    window.removeEventListener('mousemove', Move)
    window.removeEventListener('mousedown', MouseDown)
    window.removeEventListener('mouseup', MouseUp)
    window.removeEventListener('wheel', Wheel)
    window.removeEventListener('keydown', KeyDown)
    window.removeEventListener('keyup', KeyUp)
    window.removeEventListener('blur', Release)
    window.removeEventListener('contextmenu', Context)
    document.removeEventListener('visibilitychange', Hidden)
    document.removeEventListener('pointerlockchange', Lock)
    document.removeEventListener('pointerlockerror', Refused)
    if (document.pointerLockElement === Canvas) document.exitPointerLock()
  }
}
