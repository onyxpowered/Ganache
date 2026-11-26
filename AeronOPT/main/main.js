import path from 'path'
import { writeFile as Write } from 'fs/promises'
import { app, ipcMain, session, desktopCapturer, screen, dialog, shell, systemPreferences, powerSaveBlocker, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers/create-window.js'
import { Host, Remember, Keep, Pad, Hold, Filled, Cover } from './Registry.js'
import { Apply, Reset, Close } from './Inject.js'
import { Build } from './Receiver.js'
import { Light, Dark } from './Icon.js'

const Aeron = { Home: null, Uni: null, Tray: null, Status: 'Idle', Block: -1, Quitting: false }
const Prod = process.env.NODE_ENV === 'production'
const Quiet = process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)

if (Prod) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

const Lock = app.requestSingleInstanceLock()

if (!Lock) app.exit(0)

const Load = (Window, Route) =>
  Prod ? Window.loadURL(`app://./${Route}`) : Window.loadURL(`http://localhost:${process.argv[2]}/${Route}`)

const Preload = path.join(import.meta.dirname, 'preload.js')

const Send = (Command) => Aeron.Uni.webContents.send('Aeron:Command', Command)

const Show = () => {
  if (!Aeron.Home || Aeron.Home.isDestroyed()) return
  Aeron.Home.show()
  Aeron.Home.focus()
}

const Live = () => Aeron.Status === 'Online'

const Menus = () => {
  if (!Aeron.Tray) return
  const Label = Live() ? 'Mirroring' : Aeron.Status === 'Idle' ? 'Offline' : 'Not mirroring'
  Aeron.Tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: Label, enabled: false },
      { label: Live() ? 'Stop mirroring' : 'Start mirroring', click: () => (Live() ? Stop() : Start()) },
      { type: 'separator' },
      { label: 'Show Aeron OPT', click: Show },
      { label: 'Quit Aeron OPT', click: () => app.quit() },
    ])
  )
}

const Start = () => {
  Keep(true)
  Send({ Type: 'Online' })
}

const Stop = () => {
  Keep(false)
  Send({ Type: 'Offline' })
}

const Tell = (Message) => {
  if (!Message.startsWith('Links:')) {
    Aeron.Status = Message
    if (Message === 'Online' && Aeron.Block < 0) Aeron.Block = powerSaveBlocker.start('prevent-display-sleep')
    if (Message !== 'Online' && Aeron.Block >= 0) {
      powerSaveBlocker.stop(Aeron.Block)
      Aeron.Block = -1
    }
    Menus()
  }
  if (Aeron.Home && !Aeron.Home.isDestroyed()) Aeron.Home.webContents.send('Aeron:Status', Message)
}

;(async () => {
  if (!Lock) return
  await app.whenReady()

  session.defaultSession.setDisplayMediaRequestHandler(async (_Request, Callback) => {
    const Sources = await desktopCapturer.getSources({ types: ['screen'] })
    const Primary = String(screen.getPrimaryDisplay().id)
    const Pick = Sources.find((Source) => Source.display_id === Primary) || Sources[0]
    Callback({ video: Pick, audio: 'loopback' })
  })

  Aeron.Uni = new BrowserWindow({
    show: false,
    webPreferences: { preload: Preload, backgroundThrottling: false },
  })
  await Load(Aeron.Uni, 'Uni')

  Aeron.Home = createWindow('main', {
    show: false,
    width: 720,
    height: 760,
    minWidth: 560,
    minHeight: 560,
    backgroundColor: '#000000',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 21 },
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#000000', symbolColor: '#ededed', height: 56 },
    webPreferences: { preload: Preload },
  })
  Aeron.Home.on('close', (Event) => {
    if (Aeron.Quitting) return
    Event.preventDefault()
    Aeron.Home.hide()
  })
  await Load(Aeron.Home, 'Home')
  if (!Quiet) Show()

  const Icon = nativeImage.createFromBuffer(Buffer.from(process.platform === 'darwin' ? Dark : Light, 'base64'))
  if (process.platform === 'darwin') Icon.setTemplateImage(true)
  Aeron.Tray = new Tray(Icon)
  Aeron.Tray.setToolTip('Aeron OPT')
  Aeron.Tray.on('click', Show)
  Menus()
})()

app.on('second-instance', Show)

app.on('activate', Show)

app.on('before-quit', () => {
  Aeron.Quitting = true
  Close()
})

app.on('window-all-closed', () => {})

ipcMain.handle('Aeron:Session', () => Host().Session)

ipcMain.handle('Aeron:Online', Start)

ipcMain.handle('Aeron:Offline', Stop)

ipcMain.handle('Aeron:Restore', () => Remember())

const Trusted = (Ask) => (process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(Ask) : true)

ipcMain.handle('Aeron:Control', (_Event, Value) => {
  if (typeof Value === 'boolean') {
    Hold(Value)
    Reset()
    if (!Value) Close()
    if (Value) Trusted(true)
    Send({ Type: 'Control', On: Value })
  }
  return { On: Pad(), Trusted: Trusted(false) }
})

ipcMain.handle('Aeron:Fill', (_Event, Value) => {
  if (typeof Value === 'boolean') {
    Cover(Value)
    Send({ Type: 'Fill', On: Value })
  }
  return Filled()
})

ipcMain.handle('Aeron:Trust', () => {
  if (process.platform === 'darwin' && !Trusted(false)) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }
  return Trusted(false)
})

ipcMain.on('Aeron:Input', (_Event, Events) => {
  if (Pad()) Apply(Events, screen.getPrimaryDisplay(), Filled())
})

ipcMain.handle('Aeron:Login', (_Event, Value) => {
  if (!Prod) return null
  if (typeof Value === 'boolean') app.setLoginItemSettings({ openAtLogin: Value, args: ['--hidden'] })
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('Aeron:Access', () => (process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'))

ipcMain.handle('Aeron:Allow', async () => {
  if (process.platform === 'darwin') {
    await desktopCapturer.getSources({ types: ['screen'] }).catch(() => [])
    if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    }
    return systemPreferences.getMediaAccessStatus('screen')
  }
  return 'granted'
})

ipcMain.on('Aeron:Report', (_Event, Message) => Tell(Message))

ipcMain.handle('Aeron:Receiver', async () => {
  const Choice = await dialog.showSaveDialog(Aeron.Home, {
    defaultPath: 'AeronOPT.html',
    filters: [{ name: 'AeronX Receiver', extensions: ['html'] }],
  })
  if (Choice.canceled || !Choice.filePath) return null
  await Write(Choice.filePath, Build(Host().Session))
  return Choice.filePath
})
