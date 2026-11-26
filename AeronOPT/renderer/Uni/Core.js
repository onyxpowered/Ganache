import { initializeApp as Init } from 'firebase/app'
import { initializeAuth as Auth, inMemoryPersistence as Memory, signInAnonymously as SignIn } from 'firebase/auth'
import { getDatabase as GetDb, ref as Ref, set as Set, remove as Remove, onChildAdded as OnAdded, onValue as OnValue } from 'firebase/database'
import Shards from './Shards.json'
import { Pack, Unpack } from './Wire.js'

// One write must stay under the rules' 900k-char Data cap; base64 is 4/3, so ~600 KB raw per part.
const Cap = 600000

const Shape = (Settings) => {
  const [W, H] = String(Settings.Res || '1280x720').split('x').map(Number)
  const Fps = Number(Settings.Fps) || 30
  return { Width: W || 1280, Height: H || 720, Fps, Gap: 1000 / Fps }
}

// H.264 levels cap macroblocks per second; a Baseline 3.1 string fails to configure above 720p30.
const Level = (Width, Height, Fps) => {
  const Rate = Math.ceil(Width / 16) * Math.ceil(Height / 16) * Fps
  const Size = Math.ceil(Width / 16) * Math.ceil(Height / 16)
  const Table = [
    [108000, 3600, '1f'],
    [216000, 5120, '20'],
    [245760, 8192, '28'],
    [522240, 8704, '2a'],
    [589824, 22080, '32'],
    [983040, 36864, '33'],
    [2073600, 36864, '34'],
    [4177920, 139264, '3c'],
    [8355840, 139264, '3d'],
    [16711680, 139264, '3e'],
  ]
  const Hit = Table.find(([Mbs, Fs]) => Rate <= Mbs && Size <= Fs) || Table[Table.length - 1]
  return Hit[2]
}

const CodecFor = (Settings) => {
  const { Width, Height, Fps } = Shape(Settings)
  const Codec = (Settings.Codec || 'auto').trim()
  if (Codec !== 'auto') return Codec
  return Width * Height * Fps <= 1280 * 720 * 30 ? 'avc1.42001f' : `avc1.6400${Level(Width, Height, Fps)}`
}
const Linger = 3000

let Run = 0

// Each side gets its own Firebase app instances. Sharing one instance would let the SDK fire
// listeners from its local cache and the "network" stage would measure nothing.
const Open = async (Tag, Count) => {
  Run++
  const Usable = Shards.map((Config, Index) => ({ Config, Index }))
    .filter(({ Config }) => Config.databaseURL && Config.apiKey)
    .slice(0, Count)
  const Results = await Promise.allSettled(
    Usable.map(async ({ Config, Index }) => {
      const App = Init(Config, `${Tag}${Run}_${Index}`)
      await SignIn(Auth(App, { persistence: Memory }))
      return { Index, Db: GetDb(App) }
    })
  )
  return Results.filter((Result) => Result.status === 'fulfilled').map((Result) => Result.value)
}

// Epoch milliseconds, corrected by Firebase's server clock offset so two devices share a timeline.
const Clock = (Link) => {
  let Offset = 0
  const Off = OnValue(Ref(Link.Db, '.info/serverTimeOffset'), (Snap) => {
    Offset = Snap.val() || 0
  })
  return { Stamp: () => performance.timeOrigin + performance.now() + Offset, Off }
}

const Rank = (Values, Share) => {
  if (!Values.length) return NaN
  const Sorted = [...Values].sort((A, B) => A - B)
  return Sorted[Math.min(Sorted.length - 1, Math.floor(Share * Sorted.length))]
}

export const Ledger = (Window = 10000) => {
  const L = { Rows: [], Acks: [], Sent: [], Got: [], Drops: [], Lost: [], Hedges: [], Inputs: [], Pressed: [], Skipped: 0, KeyReqs: 0, Asked: 0, From: 0 }
  const Recent = (List, Now) => List.filter((Item) => Now - Item.At <= Window)
  return {
    Data: L,
    Begin: (At) => {
      L.From = At
    },
    Sent: (At, Bytes, Key, Encode) => L.Sent.push({ At, Bytes, Key, Encode }),
    Ack: (At, Ms) => L.Acks.push({ At, Ms }),
    Drop: (At) => L.Drops.push({ At }),
    KeyReq: () => L.KeyReqs++,
    Hedged: () => L.Hedges.push({ At: performance.timeOrigin + performance.now() }),
    Got: (At, Bytes) => L.Got.push({ At, Bytes }),
    Shown: (Row) => {
      if (Row.T >= L.From) L.Rows.push({ At: Row.S, ...Row })
    },
    Lost: (At) => L.Lost.push({ At }),
    Skip: (Count) => {
      L.Skipped += Count
    },
    Asked: () => L.Asked++,
    InputSent: (At, Count) => L.Pressed.push({ At, Count }),
    // Each entry is [id, capture T, time the streaming side received it], shown at S.
    Inputs: (S, List) => {
      for (const [, T, R] of List) if (T >= L.From) L.Inputs.push({ At: S, Photon: S - T, Net: R - T })
    },
    Summary: (Now) => {
      const Rows = Recent(L.Rows, Now)
      const Sent = Recent(L.Sent, Now)
      const Got = Recent(L.Got, Now)
      const Acks = Recent(L.Acks, Now)
      const Span = Math.min(Window, Math.max(1, Now - L.From)) / 1000
      const Inputs = Recent(L.Inputs, Now)
      const Stage = (Pick, List = Rows) => {
        const Values = List.map(Pick).filter(Number.isFinite)
        return { P50: Rank(Values, 0.5), P95: Rank(Values, 0.95), P99: Rank(Values, 0.99), Max: Values.length ? Math.max(...Values) : NaN }
      }
      const Keys = Sent.filter((Item) => Item.Key)
      const Deltas = Sent.filter((Item) => !Item.Key)
      const Mean = (List) => (List.length ? List.reduce((Sum, Item) => Sum + Item.Bytes, 0) / List.length : NaN)
      return {
        Stages: {
          Encode: Stage((R) => R.E - R.T),
          'Pack + queue': Stage((R) => R.W - R.E),
          Network: Stage((R) => R.A - R.W),
          Reorder: Stage((R) => R.D - R.A),
          'Decode + draw': Stage((R) => R.S - R.D),
          Total: Stage((R) => R.S - R.T),
          'Total, keyframes': Stage((R) => (R.K ? R.S - R.T : NaN)),
          'Total, deltas': Stage((R) => (R.K ? NaN : R.S - R.T)),
          'Input → photon': Stage((I) => I.Photon, Inputs),
          'Input network': Stage((I) => I.Net, Inputs),
        },
        Shards: Rows.map((R) => R.L)
          .filter((Index, At, All) => Index !== undefined && All.indexOf(Index) === At)
          .sort((A, B) => A - B)
          .map((Index) => {
            const Values = Rows.filter((R) => R.L === Index).map((R) => R.A - R.W)
            return { Index, Count: Values.length, P50: Rank(Values, 0.5), P95: Rank(Values, 0.95), Max: Math.max(...Values) }
          }),
        Counts: {
          'Sent fps': Sent.length / Span,
          'Shown fps': Rows.length / Span,
          'Sent kbps': (Sent.reduce((Sum, Item) => Sum + Item.Bytes, 0) * 8) / 1000 / Span,
          'Wire kbps (base64)': (Got.reduce((Sum, Item) => Sum + Item.Bytes, 0) * 8) / 1000 / Span,
          'Delta KB': Mean(Deltas) / 1000,
          'Key KB': Mean(Keys) / 1000,
          'Ack p50 ms': Rank(Acks.map((Item) => Item.Ms), 0.5),
          'Ack p95 ms': Rank(Acks.map((Item) => Item.Ms), 0.95),
          'Dropped (window)': Recent(L.Drops, Now).length,
          'Holes (window)': Recent(L.Lost, Now).length,
          'Skipped total': L.Skipped,
          'Hedged (window)': Recent(L.Hedges, Now).length,
          'Key requests': L.KeyReqs || L.Asked,
          'Inputs (window)': Inputs.length,
          'Inputs sent (window)': Recent(L.Pressed, Now).reduce((Sum, Item) => Sum + Item.Count, 0),
        },
      }
    },
  }
}

const Synthetic = (Settings, Feed, Stamp, Hook) => {
  const { Width, Height, Fps, Gap } = Shape(Settings)
  const Canvas = new OffscreenCanvas(Width, Height)
  const Paint = Canvas.getContext('2d', { alpha: false })
  const Start = performance.now()
  let Count = 0
  let Alive = true
  const Tick = () => {
    if (!Alive) return
    const T = Stamp()
    const Phase = Count / Fps
    Paint.fillStyle = `hsl(${(Count * 2) % 360} 40% 18%)`
    Paint.fillRect(0, 0, Width, Height)
    for (let Index = 0; Index < 12; Index++) {
      const X = (Math.sin(Phase * 1.3 + Index) * 0.5 + 0.5) * (Width - 160)
      const Y = (Math.cos(Phase * 0.9 + Index * 1.7) * 0.5 + 0.5) * (Height - 160)
      Paint.fillStyle = `hsl(${Index * 30} 70% 55%)`
      Paint.fillRect(X, Y, 160, 160)
    }
    // A noisy patch keeps the encoder honest, like foliage or particles in a real game.
    for (let Index = 0; Index < 400; Index++) {
      Paint.fillStyle = `hsl(${Math.random() * 360} 60% ${30 + Math.random() * 40}%)`
      Paint.fillRect(40 + Math.random() * 400, Height - 280 + Math.random() * 240, 8, 8)
    }
    Paint.fillStyle = '#fff'
    Paint.font = '600 96px system-ui'
    Paint.fillText(String(Count), Width - 360, 120)
    const Ids = Hook ? Hook(Paint, Width, Height) : []
    Feed(new VideoFrame(Canvas, { timestamp: Math.round((Count * 1e6) / Fps) }), T, Ids)
    Count++
    setTimeout(Tick, Math.max(0, Start + Count * Gap - performance.now()))
  }
  Tick()
  return () => {
    Alive = false
  }
}

// Game-like content: a detailed world texture panned like a moving camera (every pixel changes every
// frame), drifting particles and film grain. JPEG and H.264 both have to work for it, unlike flat shapes.
// Generated at up to 2560x1440 (per-pixel noise is slow), then upscaled so the world stays ~2x the
// output and the camera can pan at 4K. Blobs and lines are drawn after scaling so edges stay sharp.
const World = (Width, Height) => {
  const OutW = Math.max(2560, Width * 2)
  const OutH = Math.max(1440, Height * 2)
  const W = Math.min(2560, OutW)
  const H = Math.min(1440, OutH)
  const Seed = new OffscreenCanvas(W, H)
  const Paint = Seed.getContext('2d')
  const Image = Paint.createImageData(W, H)
  const Px = Image.data
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      const Ground = Math.sin(X * 0.013) * Math.cos(Y * 0.011) + Math.sin((X + Y) * 0.041) * 0.5 + Math.sin(X * 0.17 + Math.cos(Y * 0.09) * 3) * 0.25
      const Grit = Math.random() * 0.35
      const Leaf = Ground + Grit
      const I = (Y * W + X) * 4
      Px[I] = 40 + Leaf * 45 + Grit * 120
      Px[I + 1] = 80 + Leaf * 60 + Grit * 90
      Px[I + 2] = 50 + Math.sin(Y * 0.02) * 30 + Grit * 70
      Px[I + 3] = 255
    }
  }
  Paint.putImageData(Image, 0, 0)
  const Canvas = W === OutW && H === OutH ? Seed : new OffscreenCanvas(OutW, OutH)
  const Big = Canvas.getContext('2d')
  if (Canvas !== Seed) Big.drawImage(Seed, 0, 0, OutW, OutH)
  const Scale = OutW / 2560
  for (let Index = 0; Index < 1500 * Scale * Scale; Index++) {
    Big.fillStyle = `hsla(${20 + Math.random() * 100} 45% ${20 + Math.random() * 50}% / 0.8)`
    Big.beginPath()
    Big.arc(Math.random() * OutW, Math.random() * OutH, (3 + Math.random() * 24) * Scale, 0, Math.PI * 2)
    Big.fill()
  }
  if (Canvas !== Seed) {
    // Fine high-contrast detail at full scale so upscaling doesn't hand the encoder soft, easy texture.
    Big.lineWidth = 1
    for (let Index = 0; Index < 6000 * Scale * Scale; Index++) {
      const X = Math.random() * OutW
      const Y = Math.random() * OutH
      Big.strokeStyle = `hsla(${40 + Math.random() * 80} 30% ${10 + Math.random() * 70}% / 0.7)`
      Big.beginPath()
      Big.moveTo(X, Y)
      Big.lineTo(X + (Math.random() - 0.5) * 18, Y + (Math.random() - 0.5) * 18)
      Big.stroke()
    }
  }
  return { Canvas, W: OutW, H: OutH }
}

const Grain = () =>
  Array.from({ length: 4 }, () => {
    const Tile = new OffscreenCanvas(256, 256)
    const Paint = Tile.getContext('2d')
    const Image = Paint.createImageData(256, 256)
    for (let I = 0; I < Image.data.length; I += 4) {
      const V = Math.random() * 255
      Image.data[I] = Image.data[I + 1] = Image.data[I + 2] = V
      Image.data[I + 3] = 255
    }
    Paint.putImageData(Image, 0, 0)
    return Tile
  })

const Game = (Settings, Feed, Stamp, Hook) => {
  const { Width, Height, Fps, Gap } = Shape(Settings)
  const Land = World(Width, Height)
  const Noise = Grain()
  const Canvas = new OffscreenCanvas(Width, Height)
  const Paint = Canvas.getContext('2d', { alpha: false })
  const Patterns = Noise.map((Tile) => Paint.createPattern(Tile, 'repeat'))
  const Sparks = Array.from({ length: 300 }, () => ({ X: Math.random() * Width, Y: Math.random() * Height, V: 2 + Math.random() * 6, R: 1 + Math.random() * 3 }))
  const Start = performance.now()
  let Count = 0
  let Alive = true
  const Tick = () => {
    if (!Alive) return
    const T = Stamp()
    const Phase = Count / Fps
    // Ping-pong pan across the world with a little bob, like a third-person camera.
    const SpanX = Land.W - Width
    const SpanY = Land.H - Height
    const PanX = Math.abs(((Phase * 220 * (Width / 1280)) % (SpanX * 2)) - SpanX)
    const PanY = SpanY / 2 + Math.sin(Phase * 1.7) * (SpanY / 2 - 4)
    Paint.drawImage(Land.Canvas, PanX, PanY, Width, Height, 0, 0, Width, Height)
    Paint.fillStyle = 'rgba(255, 220, 140, 0.9)'
    for (const Spark of Sparks) {
      Spark.Y -= Spark.V
      Spark.X += Math.sin(Phase * 3 + Spark.Y * 0.02) * 2
      if (Spark.Y < 0) Spark.Y = Height
      Paint.fillRect(Spark.X, Spark.Y, Spark.R, Spark.R)
    }
    Paint.globalAlpha = 0.07
    Paint.fillStyle = Patterns[Count % Patterns.length]
    Paint.fillRect(0, 0, Width, Height)
    Paint.globalAlpha = 1
    Paint.fillStyle = 'rgba(0, 0, 0, 0.55)'
    Paint.fillRect(24, Height - 64, 300, 40)
    Paint.fillStyle = '#fff'
    Paint.font = '600 22px system-ui'
    Paint.fillText(`HP 100   Frame ${Count}`, 36, Height - 36)
    const Ids = Hook ? Hook(Paint, Width, Height) : []
    Feed(new VideoFrame(Canvas, { timestamp: Math.round((Count * 1e6) / Fps) }), T, Ids)
    Count++
    setTimeout(Tick, Math.max(0, Start + Count * Gap - performance.now()))
  }
  Tick()
  return () => {
    Alive = false
  }
}

const Screen = async (Settings, Feed, Stamp, Hook) => {
  const { Width, Height, Fps, Gap } = Shape(Settings)
  if (typeof MediaStreamTrackProcessor === 'undefined') throw new Error('Screen capture needs Chrome or Edge; use Synthetic here')
  const Stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: Math.max(60, Fps) }, audio: false })
  const Track = Stream.getVideoTracks()[0]
  const Reader = new MediaStreamTrackProcessor({ track: Track }).readable.getReader()
  const Canvas = new OffscreenCanvas(Width, Height)
  const Paint = Canvas.getContext('2d', { alpha: false })
  let Alive = true
  let Count = 0
  let Due = 0
  let Fed = 0
  ;(async () => {
    while (Alive) {
      const { value, done } = await Reader.read()
      if (done) break
      const Now = performance.now()
      if (Now + 2 < Due) {
        value.close()
        continue
      }
      Due = Due + Gap < Now ? Now + Gap : Due + Gap
      const T = Stamp()
      // Same fit as Aeron Pro: whole screen with black bars, or fill (crop). The host's input mapping assumes this.
      const Sw = value.displayWidth || Width
      const Sh = value.displayHeight || Height
      const Cover = Settings.Fill ? Settings.Fill() : false
      const Fit = Cover ? Math.max(Width / Sw, Height / Sh) : Math.min(Width / Sw, Height / Sh)
      const Dw = Math.round(Sw * Fit)
      const Dh = Math.round(Sh * Fit)
      if (!Cover && (Dw !== Width || Dh !== Height)) {
        Paint.fillStyle = '#000'
        Paint.fillRect(0, 0, Width, Height)
      }
      Paint.drawImage(value, Math.round((Width - Dw) / 2), Math.round((Height - Dh) / 2), Dw, Dh)
      value.close()
      const Ids = Hook ? Hook(Paint, Width, Height) : []
      Feed(new VideoFrame(Canvas, { timestamp: Math.round((Count * 1e6) / Fps) }), T, Ids)
      Count++
      Fed = performance.now()
    }
  })().catch(() => {})
  // Screen capture only delivers frames when something changes; repeat the last one so an idle desktop still streams.
  const Keep = setInterval(() => {
    if (!Alive || !Count || performance.now() - Fed < 900) return
    Fed = performance.now()
    Feed(new VideoFrame(Canvas, { timestamp: Math.round((Count * 1e6) / Fps) }), Stamp(), [])
    Count++
  }, 250)
  return () => {
    Alive = false
    clearInterval(Keep)
    Reader.cancel().catch(() => {})
    Track.stop()
  }
}

const HevcLevel = (W, H, F) => {
  const R = W * H * F
  if (R <= 1280 * 720 * 30) return 93
  if (R <= 1920 * 1080 * 30) return 120
  if (R <= 1920 * 1080 * 60) return 123
  if (R <= 2560 * 1440 * 60) return 153
  return 156
}
const HevcString = (Settings) => {
  const { Width, Height, Fps } = Shape(Settings)
  return `hvc1.1.6.L${HevcLevel(Width, Height, Fps)}.B0`
}
const AvcString = (Settings) => CodecFor({ ...Settings, Codec: 'auto' })

const EncoderConfig = (Settings) => ({
  codec: CodecFor(Settings),
  width: Shape(Settings).Width,
  height: Shape(Settings).Height,
  bitrate: Settings.Bitrate * 1000,
  framerate: Shape(Settings).Fps,
  latencyMode: 'realtime',
  hardwareAcceleration: Settings.Hw,
  ...(CodecFor(Settings).startsWith('avc') ? { avc: { format: 'annexb' } } : {}),
})

// Some machines (and headless Chrome) have no hardware H.264 path; fall back instead of failing.
const Pick = async (Config, Codec, Verb, Log) => {
  for (const Hw of [Config.hardwareAcceleration, 'no-preference', 'prefer-software']) {
    const Trial = { ...Config, hardwareAcceleration: Hw }
    const Support = await Codec.isConfigSupported(Trial).catch(() => ({ supported: false }))
    if (Support.supported) {
      if (Hw !== Config.hardwareAcceleration) Log(`Can't ${Verb} with ${Config.hardwareAcceleration}, using ${Hw}`)
      return Trial
    }
  }
  throw new Error(`This browser can't ${Verb} ${Config.codec}`)
}

export const Source = async (Settings, Feed, Stamp, Hook) =>
  Settings.Source === 'screen' ? Screen(Settings, Feed, Stamp, Hook) : Settings.Source === 'game' ? Game(Settings, Feed, Stamp, Hook) : Synthetic(Settings, Feed, Stamp, Hook)

export const Sender = async ({ Links, Id, Settings, Stamp, Ledger, Log, Input }) => {
  const Base = `S/${Id}`
  const { Width, Height, Fps } = Shape(Settings)
  await Promise.all(Links.map((Link) => Remove(Ref(Link.Db, `${Base}/G${Link.Index}`)).catch(() => {})))
  const BitFor = (C) => (/^(hev1|hvc1)/.test(C) ? Settings.BitrateHevc || Math.round(Settings.Bitrate * 0.66) : Settings.Bitrate) * 1000
  const Conf = (C) => ({
    codec: C,
    width: Width,
    height: Height,
    bitrate: BitFor(C),
    framerate: Fps,
    latencyMode: 'realtime',
    hardwareAcceleration: Settings.Hw,
    ...(/^avc/.test(C) ? { avc: { format: 'annexb' } } : {}),
    ...(/^(hev1|hvc1)/.test(C) ? { hevc: { format: 'annexb' } } : {}),
  })
  let Active = AvcString(Settings)
  let Config = await Pick(Conf(Active), VideoEncoder, 'encode', Log)

  const Inflight = Links.map(() => 0)
  const Pending = new Map()
  let Seq = Math.floor(Stamp())
  let Turn = 0
  let Count = 0
  let WantKey = true
  let Alive = true
  let Heard = Stamp()
  // Inputs painted into a frame that then gets dropped are still visible in the next one, so they ride along.
  let Carry = []
  let Spares = 0

  const Ship = (Chunk) => {
    const Meta = Pending.get(Chunk.timestamp)
    Pending.delete(Chunk.timestamp)
    if (!Meta || !Alive) return
    const E = Stamp()
    const Bytes = new Uint8Array(Chunk.byteLength)
    Chunk.copyTo(Bytes)
    const Own = ++Seq
    const Key = Chunk.type === 'key'
    // Big frames (keyframes, scene cuts) are cut into parts written to different shards in parallel,
    // so one 200 KB frame doesn't sit on a single websocket while everything queues behind it.
    // Parts above Cap are forced apart (even past one per shard) or the rules reject the write outright.
    const Limit = Settings.Split * 1000
    const Wanted = Limit > 0 && Bytes.length > Limit ? Math.min(Links.length, Math.ceil(Bytes.length / Limit)) : 1
    const Count = Math.max(Wanted, Math.ceil(Bytes.length / Cap))
    const Size = Math.ceil(Bytes.length / Count)
    const Shards = []
    for (let Part = 0; Part < Count; Part++) {
      let Slot = Turn % Links.length
      for (let Step = 1; Step < Links.length; Step++) {
        const Index = (Turn + Step) % Links.length
        if (!Shards.includes(Index) && (Shards.includes(Slot) || Inflight[Index] < Inflight[Slot])) Slot = Index
      }
      Shards.push(Slot)
      Turn++
    }
    // Pack every part before stamping W, so base64 time counts as queue time, not network time.
    const Datas = Shards.map((_, Part) => Pack(Bytes.subarray(Part * Size, (Part + 1) * Size)))
    const W = Stamp()
    Ledger.Sent(W, Bytes.length, Key, E - Meta.T)
    let Left = Count
    // Resolves true when the server confirmed the write, false when it failed (never rejects).
    const Write = (Slot, Path, Packet) => {
      const Link = Links[Slot]
      Inflight[Slot]++
      return Set(Ref(Link.Db, Path), Packet)
        .then(() => true)
        .catch((Error) => {
          Log(`Write failed on shard ${Link.Index}: ${Error.message}`)
          return false
        })
        .finally(() => {
          Inflight[Slot]--
          setTimeout(() => Remove(Ref(Link.Db, Path)).catch(() => {}), Linger)
        })
    }
    const Other = (Slot) => {
      let Best = -1
      for (let Index = 0; Index < Links.length; Index++) {
        if (Index !== Slot && (Best < 0 || Inflight[Index] < Inflight[Best])) Best = Index
      }
      return Best
    }
    Shards.forEach((Slot, Part) => {
      const Packet = { Seq: Own, Data: Datas[Part], K: Key, T: Meta.T, E, W, P: Part, N: Count, ...(Key ? { C: Active } : {}), ...(Meta.I.length ? { I: Meta.I } : {}) }
      let Done = false
      let Hedged = false
      // Hedge: a slow write means a stalled shard, a failed one means a lost frame. Either way send the
      // same part once on the least busy other shard; the receiver keeps whichever copy lands first.
      // Timeout hedges are capped: under congestion every write is slow, and resending them all only adds load.
      const Resend = (Failed) => {
        if (Done || Hedged || !Alive || Links.length < 2) return
        if (!Failed && Spares >= 2) return
        Hedged = true
        Spares++
        const Slot2 = Other(Slot)
        Ledger.Hedged()
        Write(Slot2, `${Base}/G${Links[Slot2].Index}/${Own}_${Part}h`, Packet).then((Ok) => {
          Spares--
          if (Ok && !Done) {
            Done = true
            if (--Left === 0) Ledger.Ack(Stamp(), Stamp() - W)
          }
        })
      }
      const Timer = Settings.Hedge > 0 ? setTimeout(Resend, Settings.Hedge) : 0
      Write(Slot, `${Base}/G${Links[Slot].Index}/${Own}_${Part}`, Packet).then((Ok) => {
        if (!Ok) return Resend(true)
        clearTimeout(Timer)
        if (Done) return
        Done = true
        if (--Left === 0) Ledger.Ack(Stamp(), Stamp() - W)
      })
    })
  }

  // An encoder error closes it for good; rebuild it and restart on a keyframe instead of streaming nothing.
  let Encoder = null
  const Build = () => {
    if (Encoder && Encoder.state !== 'closed') Encoder.close()
    Encoder = new VideoEncoder({
      output: Ship,
      error: (Error) => {
        Log(`Encoder: ${Error.message}; restarting it`)
        Pending.clear()
        WantKey = true
        if (Alive) setTimeout(() => Alive && Build(), 50)
      },
    })
    Encoder.configure(Config)
  }
  Build()

  // Codec negotiation: the receiver advertises what it can decode; adopt it if we can encode it,
  // otherwise stay on the safe H.264 default. Keyframes carry the active codec so the receiver
  // configures its decoder from the stream itself.
  let GotCodec = null
  const HeardCodec = new Promise((R) => (GotCodec = R))
  const Adopt = async (CodecStr) => {
    if (!CodecStr || CodecStr === Active || !Alive) return
    const Next = await Pick(Conf(CodecStr), VideoEncoder, 'encode', () => {}).catch(() => null)
    if (!Next || !Alive || CodecStr === Active) return
    Active = CodecStr
    Config = Next
    WantKey = true
    Build()
  }
  const CodecOff = Links.map((Link) =>
    OnValue(Ref(Link.Db, `${Base}/C/0`), (Snap) => {
      const V = Snap.val()
      if (!V || !V.Data) return
      if (GotCodec) {
        GotCodec()
        GotCodec = null
      }
      Adopt(V.Data)
    })
  )

  // Frames are dropped before encoding, never after: a missing delta frame would corrupt the picture.
  const Feed = (Frame, T, Ids = []) => {
    if (Ids.length) Carry = Carry.concat(Ids)
    const Busy = Inflight.reduce((Sum, Value) => Sum + Value, 0)
    if (!Alive || Encoder.state !== 'configured' || Encoder.encodeQueueSize > 2 || Busy >= Settings.Window) {
      Frame.close()
      if (Alive) Ledger.Drop(Stamp())
      return
    }
    const Key = WantKey || (Settings.Gop > 0 && Count % Settings.Gop === 0)
    WantKey = false
    Pending.set(Frame.timestamp, { T, I: Carry })
    Carry = []
    Encoder.encode(Frame, { keyFrame: Key })
    Frame.close()
    Count++
  }

  const Offs = Links.map((Link) =>
    OnValue(Ref(Link.Db, `${Base}/R/0`), (Snap) => {
      const Ask = Snap.val()
      if (!Ask || Ask.Seq <= Heard) return
      Heard = Ask.Seq
      WantKey = true
      Ledger.KeyReq()
    })
  )

  Ledger.Begin(Stamp())
  // Give the receiver a moment to publish its codec choice before the first frames go out.
  await Promise.race([HeardCodec, new Promise((R) => setTimeout(R, 800))])
  const Halt = await Source(Settings, Feed, Stamp, Input && Input.Hook)

  return () => {
    Alive = false
    Halt()
    Offs.forEach((Off) => Off())
    CodecOff.forEach((Off) => Off())
    if (Encoder.state !== 'closed') Encoder.close()
    setTimeout(() => Links.forEach((Link) => Remove(Ref(Link.Db, `${Base}/G${Link.Index}`)).catch(() => {})), Linger)
  }
}

export const Receiver = async ({ Links, Id, Settings, Stamp, Ledger, Canvas, Log }) => {
  const Base = `S/${Id}`
  const Draw = Canvas.getContext('2d', { alpha: false })
  const { Width, Height } = Shape(Settings)
  Canvas.width = Width
  Canvas.height = Height
  const Waiting = new Map()
  const Parts = new Map()
  const Rows = new Map()
  let Expect = 0
  let Since = performance.now()
  let Alive = true
  let Last = 0
  let Decoder = null

  const Ask = () => {
    const Now = performance.now()
    if (Now - Last < 1000) return
    Last = Now
    const Seq = Stamp()
    Links.forEach((Link) => Set(Ref(Link.Db, `${Base}/R/0`), { Seq, Data: 'Key' }).catch(() => {}))
    Ledger.Asked()
  }

  const Show = (Frame) => {
    const Row = Rows.get(Frame.timestamp)
    Rows.delete(Frame.timestamp)
    Draw.drawImage(Frame, 0, 0, Width, Height)
    Frame.close()
    if (!Row) return
    const S = Stamp()
    Ledger.Shown({ ...Row, S })
    if (Row.I) Ledger.Inputs(S, Row.I)
  }

  const AvcStr = AvcString(Settings)
  const HevcStr = HevcString(Settings)
  const CanHevc =
    Settings.Codec !== 'avc' &&
    (await VideoDecoder.isConfigSupported({ codec: HevcStr, codedWidth: Width, codedHeight: Height, hardwareAcceleration: 'prefer-hardware' }).catch(() => ({ supported: false }))).supported
  let Codec = CanHevc ? HevcStr : AvcStr
  Links.forEach((Link) => Set(Ref(Link.Db, `${Base}/C/0`), { Seq: Stamp(), Data: Codec }).catch(() => {}))

  const Make = () => {
    if (Decoder && Decoder.state !== 'closed') Decoder.close()
    Decoder = new VideoDecoder({
      output: Show,
      error: (Error) => {
        Log(`Decoder: ${Error.message}`)
        Expect = 0
        if (Alive) {
          Make()
          Ask()
        }
      },
    })
    Decoder.configure({ codec: Codec, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware', codedWidth: Width, codedHeight: Height })
  }

  const Pump = () => {
    if (!Expect) {
      let Best = 0
      for (const [Seq, Packet] of Waiting) if (Packet.K && Seq > Best) Best = Seq
      if (!Best) return
      for (const Seq of [...Waiting.keys()]) if (Seq < Best) Waiting.delete(Seq)
      Expect = Best
    }
    while (Waiting.has(Expect) && Decoder.state === 'configured') {
      const Packet = Waiting.get(Expect)
      if (Packet.K && Packet.C && Packet.C !== Codec) {
        Codec = Packet.C
        Make()
      }
      Waiting.delete(Expect)
      Rows.set(Expect, { L: Packet.L, T: Packet.T, E: Packet.E, W: Packet.W, A: Packet.A, D: Stamp(), K: Packet.K, I: Packet.I })
      Decoder.decode(new EncodedVideoChunk({ type: Packet.K ? 'key' : 'delta', timestamp: Expect, data: Packet.Bytes }))
      Expect++
      Since = performance.now()
    }
  }

  // If the next frame hasn't shown up while later ones have, treat it as lost and resync on a keyframe.
  const Recent = []
  const Patience = () => {
    if (Recent.length < 20) return Settings.Hole
    const Sorted = [...Recent].sort((A, B) => A - B)
    return Math.min(1000, Math.max(Settings.Hole, Sorted[Math.floor(Sorted.length * 0.95)] * 1.5))
  }

  const Watchdog = setInterval(() => {
    // Waiting for a keyframe: keep asking (Ask is rate-limited) so a dropped request can't stall us forever.
    if (!Expect) return Ask()
    // A frame that's late is not lost (RTDB delivers every confirmed write). Only give up on it after clearly
    // longer than the network's recent worst case, so congestion doesn't trigger a keyframe spiral.
    if (!Waiting.size || performance.now() - Since < Patience()) return
    Ledger.Lost(Stamp())
    let Next = 0
    for (const [Seq, Packet] of Waiting) if (Packet.K && Seq > Expect && (!Next || Seq < Next)) Next = Seq
    if (Next) {
      Ledger.Skip(Next - Expect)
      for (const Seq of [...Waiting.keys()]) if (Seq < Next) Waiting.delete(Seq)
      for (const Seq of [...Parts.keys()]) if (Seq < Next) Parts.delete(Seq)
      Expect = Next
      Since = performance.now()
      Pump()
    } else {
      Expect = 0
      Ask()
    }
  }, 20)

  Make()
  Ledger.Begin(Stamp())

  const Stops = Links.map((Link) =>
    OnAdded(Ref(Link.Db, `${Base}/G${Link.Index}`), (Snap) => {
      const Packet = Snap.val()
      if (!Packet || !Alive || (Expect && Packet.Seq < Expect)) return
      Ledger.Got(Stamp(), Packet.Data.length)
      if (Waiting.has(Packet.Seq) || (Expect && Packet.Seq < Expect)) return
      const Count = Packet.N || 1
      let Whole = Parts.get(Packet.Seq)
      if (!Whole) Parts.set(Packet.Seq, (Whole = { Pieces: new Array(Count), Left: Count }))
      if (Whole.Pieces[Packet.P || 0]) return
      Whole.Pieces[Packet.P || 0] = Unpack(Packet.Data)
      if (--Whole.Left > 0) return
      Parts.delete(Packet.Seq)
      const Total = Whole.Pieces.reduce((Sum, Piece) => Sum + Piece.length, 0)
      const Bytes = new Uint8Array(Total)
      let Offset = 0
      for (const Piece of Whole.Pieces) {
        Bytes.set(Piece, Offset)
        Offset += Piece.length
      }
      Recent.push(Stamp() - Packet.W)
      if (Recent.length > 90) Recent.shift()
      Waiting.set(Packet.Seq, { L: Link.Index, Seq: Packet.Seq, K: Packet.K, C: Packet.C, T: Packet.T, E: Packet.E, W: Packet.W, A: Stamp(), I: Packet.I, Bytes })
      Pump()
    })
  )

  Ask()

  return () => {
    Alive = false
    clearInterval(Watchdog)
    Stops.forEach((Stop) => Stop())
    if (Decoder && Decoder.state !== 'closed') Decoder.close()
  }
}

export { Open, Clock, Shape, CodecFor }
