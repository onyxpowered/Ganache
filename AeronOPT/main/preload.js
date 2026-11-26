import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('Aeron', {
  Session: () => ipcRenderer.invoke('Aeron:Session'),
  Receiver: () => ipcRenderer.invoke('Aeron:Receiver'),
  Restore: () => ipcRenderer.invoke('Aeron:Restore'),
  Control: (Value) => ipcRenderer.invoke('Aeron:Control', Value),
  Fill: (Value) => ipcRenderer.invoke('Aeron:Fill', Value),
  Trust: () => ipcRenderer.invoke('Aeron:Trust'),
  Input: (Events) => ipcRenderer.send('Aeron:Input', Events),
  Login: (Value) => ipcRenderer.invoke('Aeron:Login', Value),
  Access: () => ipcRenderer.invoke('Aeron:Access'),
  Allow: () => ipcRenderer.invoke('Aeron:Allow'),
  Online: () => ipcRenderer.invoke('Aeron:Online'),
  Offline: () => ipcRenderer.invoke('Aeron:Offline'),
  Report: (Message) => ipcRenderer.send('Aeron:Report', Message),
  On: (Callback) => {
    const Handle = (_Event, Command) => Callback(Command)
    ipcRenderer.on('Aeron:Command', Handle)
    return () => ipcRenderer.removeListener('Aeron:Command', Handle)
  },
  Status: (Callback) => {
    const Handle = (_Event, Message) => Callback(Message)
    ipcRenderer.on('Aeron:Status', Handle)
    return () => ipcRenderer.removeListener('Aeron:Status', Handle)
  },
})
