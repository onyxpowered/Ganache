import { useEffect } from 'react'
import { Open } from '../Uni/Link.js'
import { Send as Frames } from '../Uni/Optimum.js'
import { Send as Sound } from '../Uni/Sound.js'
import { Publish, Clear, Listen } from '../Uni/Control.js'

export default function Uni() {
  useEffect(() => {
    const State = { Links: null, Id: '', Stops: [], Stream: null, Beat: 0, Online: false, Control: false, Pad: null, Seen: 0, Dog: 0, Fill: true }

    const Meta = () => {
      if (State.Online) Publish(State.Links, State.Id, 'M', { Mode: 'Playing', Current: '', Games: [], Control: State.Control })
    }

    const Halt = () => {
      clearInterval(State.Dog)
      State.Stops.forEach((Off) => Off())
      State.Stops = []
      if (State.Stream) State.Stream.getTracks().forEach((Track) => Track.stop())
      State.Stream = null
    }

    const Stream = async () => {
      State.Stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: true })
      const Video = State.Stream.getVideoTracks()[0]
      const Audio = State.Stream.getAudioTracks()[0]
      State.Seen = Date.now()
      State.Stops.push(await Frames({ Links: State.Links, Id: State.Id, Log: (Text) => console.warn(Text), Pulse: () => (State.Seen = Date.now()), Fill: () => State.Fill }))
      if (Audio) State.Stops.push(await Sound({ Links: State.Links, Id: State.Id, Track: Audio }))
      Video.onended = Again
      State.Dog = setInterval(() => {
        if (Date.now() - State.Seen > 8000) Again()
      }, 3000)
    }

    const Again = async () => {
      if (!State.Online || State.Retry) return
      State.Retry = true
      Halt()
      try {
        await Stream()
      } catch (Error) {
        window.Aeron.Report(`Failed: ${Error.message}`)
      }
      State.Retry = false
    }

    const Offline = () => {
      Halt()
      clearInterval(State.Beat)
      if (State.Pad) State.Pad()
      State.Pad = null
      if (State.Online) {
        Clear(State.Links, State.Id, 'M')
        Clear(State.Links, State.Id, 'I')
      }
      State.Online = false
      window.Aeron.Report('Idle')
    }

    const Online = async () => {
      if (State.Online) return
      try {
        State.Id = await window.Aeron.Session()
        State.Links = State.Links || (await Open())
        if (!State.Links.length) return window.Aeron.Report('NoShards')
        State.Control = (await window.Aeron.Control()).On
        State.Fill = await window.Aeron.Fill()
        Clear(State.Links, State.Id, 'I')
        State.Pad = Listen(State.Links, State.Id, 'I', (Events) => window.Aeron.Input(Events))
        State.Online = true
        await Stream()
        Meta()
        State.Beat = setInterval(Meta, 5000)
        window.Aeron.Report(`Links:${State.Links.length}`)
        window.Aeron.Report('Online')
      } catch (Error) {
        Offline()
        window.Aeron.Report(`Failed: ${Error.message}`)
      }
    }

    const Off = window.Aeron.On((Command) => {
      if (Command.Type === 'Online') return Online()
      if (Command.Type === 'Offline') return Offline()
      if (Command.Type === 'Fill') State.Fill = Command.On
      if (Command.Type === 'Control') {
        State.Control = Command.On
        return Meta()
      }
    })
    window.Aeron.Restore().then((Again) => Again && Online())
    return () => {
      Off()
      Offline()
    }
  }, [])

  return null
}
