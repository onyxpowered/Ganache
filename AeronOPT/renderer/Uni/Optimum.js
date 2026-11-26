// OPT video: H.264 (WebCodecs) over the UNF Switchers, replacing the JPEG Sender/Viewer.
import { Clock, Ledger, Sender, Receiver } from './Core.js'

export const Settings = {
  Source: 'screen',
  Res: '1280x720',
  Fps: 30,
  Codec: 'auto',
  Hw: 'prefer-hardware',
  Bitrate: 3500,
  BitrateHevc: 2300,
  Gop: 0,
  Window: 12,
  Hole: 150,
  Split: 0,
  Hedge: 150,
  Stats: 10,
}

export const Send = async ({ Links, Id, Log = () => {}, Pulse = () => {}, Fill = () => false }) => {
  const Time = Clock(Links[0])
  const Book = Ledger()
  const Sent = Book.Sent
  Book.Sent = (...Args) => {
    Pulse()
    Sent(...Args)
  }
  const Stop = await Sender({ Links, Id, Settings: { ...Settings, Fill }, Stamp: Time.Stamp, Ledger: Book, Log })
  return () => {
    Stop()
    Time.Off()
  }
}

export const Watch = async ({ Links, Id, Canvas, Log = () => {}, Seen = () => {} }) => {
  const Time = Clock(Links[0])
  const Book = Ledger()
  const Shown = Book.Shown
  Book.Shown = (Row) => {
    Seen()
    Shown(Row)
  }
  const Stop = await Receiver({ Links, Id, Settings, Stamp: Time.Stamp, Ledger: Book, Canvas, Log })
  return () => {
    Stop()
    Time.Off()
  }
}
