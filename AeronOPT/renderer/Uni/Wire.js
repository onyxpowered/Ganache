export const Width = 1366
export const Height = 768
export const Rate = 30

export const Path = (Id, Kind, Slot) => `S/${Id}/${Kind}/${Slot}`

export const Text = (Blob) =>
  new Promise((Resolve, Reject) => {
    const Reader = new FileReader()
    Reader.onload = () => Resolve(Reader.result)
    Reader.onerror = () => Reject(Reader.error)
    Reader.readAsDataURL(Blob)
  })

export const Pack = (Bytes) => {
  let Out = ''
  for (let Index = 0; Index < Bytes.length; Index += 8192) {
    Out += String.fromCharCode.apply(null, Bytes.subarray(Index, Index + 8192))
  }
  return btoa(Out)
}

export const Unpack = (Data) => {
  const Raw = atob(Data)
  const Bytes = new Uint8Array(Raw.length)
  for (let Index = 0; Index < Raw.length; Index++) Bytes[Index] = Raw.charCodeAt(Index)
  return Bytes
}
