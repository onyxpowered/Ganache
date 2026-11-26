import { ref as Ref, set as Set, onValue as OnValue } from 'firebase/database'
import { Path, Pack, Unpack } from './Wire.js'

const Step = 20000

export const Send = async ({ Links, Id, Track }) => {
  const Reader = new MediaStreamTrackProcessor({ track: Track }).readable.getReader()
  const Busy = Links.map(() => false)
  let Batch = []
  let Seq = Date.now()
  let Rate = 48000
  let Chan = 2
  let Alive = true
  let Ready = false

  const Encoder = new AudioEncoder({
    output: (Chunk) => {
      const Bytes = new Uint8Array(Chunk.byteLength)
      Chunk.copyTo(Bytes)
      Batch.push(Bytes)
    },
    error: () => {},
  })

  const Flush = () => {
    if (!Batch.length) return
    const Slot = Busy.findIndex((State) => !State)
    if (Slot < 0) {
      Batch = Batch.slice(-6)
      return
    }
    let Total = 0
    for (const Bytes of Batch) Total += Bytes.length + 2
    const Joined = new Uint8Array(Total)
    let Offset = 0
    for (const Bytes of Batch) {
      Joined[Offset] = Bytes.length >> 8
      Joined[Offset + 1] = Bytes.length & 255
      Joined.set(Bytes, Offset + 2)
      Offset += Bytes.length + 2
    }
    Batch = []
    Busy[Slot] = true
    Seq++
    const Link = Links[Slot]
    Set(Ref(Link.Db, Path(Id, 'A', Link.Index)), { Seq, Rate, Chan, Data: Pack(Joined) })
      .catch(() => {})
      .finally(() => {
        Busy[Slot] = false
      })
  }

  const Timer = setInterval(Flush, 60)

  const Pump = async () => {
    while (Alive) {
      const { value, done } = await Reader.read()
      if (done) break
      if (!Ready) {
        Rate = value.sampleRate
        Chan = value.numberOfChannels
        Encoder.configure({ codec: 'opus', sampleRate: Rate, numberOfChannels: Chan, bitrate: 96000 })
        Ready = true
      }
      Encoder.encode(value)
      value.close()
    }
  }

  Pump().catch(() => {})

  return () => {
    Alive = false
    clearInterval(Timer)
    Reader.cancel().catch(() => {})
    if (Encoder.state !== 'closed') Encoder.close()
  }
}

export const Hear = async ({ Id, Links, Context }) => {
  let Decoder = null
  let Config = ''
  let Last = 0
  let Stamp = 0
  let Cursor = 0

  const Play = (Data) => {
    const Buffer = Context.createBuffer(Data.numberOfChannels, Data.numberOfFrames, Data.sampleRate)
    for (let Plane = 0; Plane < Data.numberOfChannels; Plane++) {
      const Samples = new Float32Array(Data.numberOfFrames)
      Data.copyTo(Samples, { planeIndex: Plane, format: 'f32-planar' })
      Buffer.copyToChannel(Samples, Plane)
    }
    const Now = Context.currentTime
    if (Cursor < Now + 0.02) Cursor = Now + 0.08
    if (Cursor < Now + 0.4) {
      const Node = Context.createBufferSource()
      Node.buffer = Buffer
      Node.connect(Context.destination)
      Node.start(Cursor)
      Cursor += Buffer.duration
    }
    Data.close()
  }

  const Prepare = (Rate, Chan) => {
    const Key = `${Rate}:${Chan}`
    if (Key === Config && Decoder && Decoder.state === 'configured') return
    if (Decoder && Decoder.state !== 'closed') Decoder.close()
    Decoder = new AudioDecoder({ output: Play, error: () => {} })
    Decoder.configure({ codec: 'opus', sampleRate: Rate, numberOfChannels: Chan })
    Config = Key
  }

  const Stops = Links.map((Link) =>
    OnValue(Ref(Link.Db, Path(Id, 'A', Link.Index)), (Snap) => {
      const Packet = Snap.val()
      if (!Packet || Packet.Seq <= Last) return
      Last = Packet.Seq
      Prepare(Packet.Rate, Packet.Chan)
      const Joined = Unpack(Packet.Data)
      let Offset = 0
      while (Offset + 2 <= Joined.length) {
        const Size = (Joined[Offset] << 8) | Joined[Offset + 1]
        const Bytes = Joined.subarray(Offset + 2, Offset + 2 + Size)
        Offset += Size + 2
        Decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Stamp, data: Bytes }))
        Stamp += Step
      }
    })
  )

  return () => {
    Stops.forEach((Stop) => Stop())
    if (Decoder && Decoder.state !== 'closed') Decoder.close()
  }
}
