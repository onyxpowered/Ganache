import Store from 'electron-store'
import { randomBytes as Random } from 'crypto'

let Open = null

const Data = () => {
  if (!Open) Open = new Store({ name: 'Registry' })
  return Open
}

export const Host = () => {
  let Record = Data().get('Host')
  if (!Record) {
    Record = { Id: Random(16).toString('hex'), Session: Random(16).toString('base64url') }
    Data().set('Host', Record)
  }
  return Record
}

export const Remember = () => Data().get('Online', false)

export const Keep = (State) => Data().set('Online', State)

export const Pad = () => Data().get('Control', false)

export const Hold = (State) => Data().set('Control', State)

export const Filled = () => Data().get('Fill', true)

export const Cover = (State) => Data().set('Fill', State)
