import { Open } from './Link.js'
import { Watch } from './Optimum.js'
import { Hear } from './Sound.js'
import { Listen } from './Control.js'
import { Control } from './Input.js'
import { Width, Height } from './Wire.js'

const Canvas = document.getElementById('Screen')
const Start = document.getElementById('Start')
const Menu = document.getElementById('Menu')
const Copy = document.getElementById('Copy')
const Pulse = document.getElementById('Pulse')
const State = document.getElementById('State')
const Hint = document.getElementById('Hint')
const Wait = 20000

Canvas.width = Width
Canvas.height = Height

const Show = (Playing) => {
  Canvas.hidden = !Playing
  Menu.hidden = Playing
}

Start.addEventListener('click', async () => {
  Start.remove()
  const Id = window.Session.Id
  const Context = new AudioContext({ latencyHint: 'interactive' })
  await Context.resume()
  Menu.hidden = false
  Copy.textContent = 'Connecting'
  let Frame = 0
  const Viewing = { Links: await Open() }
  if (Viewing.Links.length) await Watch({ Links: Viewing.Links, Id, Canvas, Seen: () => (Frame = Date.now()) })
  if (!Viewing.Links.length) {
    Copy.textContent = 'Could not reach the network. Check your connection and reload this page.'
    State.textContent = 'No connection'
    return
  }
  Hear({ Id, Links: Viewing.Links, Context })
  let Timer = 0
  let Pad = null
  let Gone = 0

  const Notice = (Text) => {
    Hint.textContent = Text
    Hint.hidden = false
    clearTimeout(Gone)
    Gone = setTimeout(() => (Hint.hidden = true), 4000)
  }

  const Quit = () => {
    if (Pad) Pad()
    Pad = null
    Hint.hidden = true
  }

  const Waiting = setInterval(() => {
    if (Canvas.hidden) return
    if (Date.now() - Frame > 6000) {
      Hint.textContent = 'Connected. Waiting for video from your PC.'
      Hint.hidden = false
    } else if (Hint.textContent.startsWith('Connected.')) Hint.hidden = true
  }, 1000)

  const Lost = () => {
    Show(false)
    Canvas.getContext('2d').clearRect(0, 0, Width, Height)
    Pulse.dataset.state = ''
    State.textContent = 'Offline'
    Copy.textContent = 'Your PC is not mirroring. Open AeronX on it and start mirroring.'
  }

  Lost()

  Listen(Viewing.Links, Id, 'M', (Meta) => {
    clearTimeout(Timer)
    if (!Meta) return Lost()
    Timer = setTimeout(Lost, Wait)
    Pulse.dataset.state = 'Live'
    State.textContent = 'Your PC'
    Show(true)
    if (Meta.Control && !Pad) Pad = Control({ Links: Viewing.Links, Id, Canvas, Notice })
    if (!Meta.Control && Pad) Quit()
  })
})
