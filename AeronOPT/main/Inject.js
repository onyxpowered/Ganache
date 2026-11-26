import path from 'path'
import { writeFileSync as Write } from 'fs'
import { spawn as Spawn } from 'child_process'
import { app, screen } from 'electron'
import { Mac, Win } from './Keys.js'

const Width = 1366
const Height = 768

const Script = `
ObjC.import('Foundation')
ObjC.import('CoreGraphics')
const Source = $.CGEventSourceCreate(1)
const Start = $.CGEventGetLocation($.CGEventCreate($()))
let Px = Start.x
let Py = Start.y
let Mask = 0
let Count = 0
let LastAt = 0
let LastX = 0
let LastY = 0
const Held = {}
const Flags = { 56: 0x20000, 60: 0x20000, 59: 0x40000, 62: 0x40000, 58: 0x80000, 61: 0x80000, 55: 0x100000, 54: 0x100000, 57: 0x10000 }
// Session tap, not the HID tap: under Chrome's pointer lock, HID-level synthetic moves arrive as zero or garbage,
// session-level ones carry their deltas exactly (measured 2026-11-19). Raw (unadjustedMovement) locks ignore both.
const Post = (Event) => {
  $.CGEventSetFlags(Event, Mask)
  $.CGEventPost(1, Event)
}
const Here = () => $.CGEventGetLocation($.CGEventCreate($()))
const Bounds = (() => {
  try {
    const B = $.CGDisplayBounds($.CGMainDisplayID())
    if (B && B.size && B.size.width > 0) return B
  } catch (Error) {}
  return { origin: { x: -100000, y: -100000 }, size: { width: 200000, height: 200000 } }
})()
const Clamp = (V, Lo, Hi) => Math.min(Hi - 1, Math.max(Lo, V))
const Move = (X, Y, Dx, Dy) => {
  if (Dx === undefined) {
    Dx = Math.round(X - Px)
    Dy = Math.round(Y - Py)
  }
  Px = X
  Py = Y
  let Type = 5
  let Button = 0
  if (Held[0]) { Type = 6 } else if (Held[1]) { Type = 7; Button = 1 } else if (Held[2]) { Type = 27; Button = 2 }
  const Event = $.CGEventCreateMouseEvent(Source, Type, $.CGPointMake(X, Y), Button)
  // Pointer-locked games (Luna, browsers, most shooters) read only these deltas, never the position.
  $.CGEventSetIntegerValueField(Event, 4, Dx)
  $.CGEventSetIntegerValueField(Event, 5, Dy)
  Post(Event)
}
const Press = (Number, Down) => {
  const Types = [[1, 2], [3, 4], [25, 26]][Math.min(Number, 2)]
  const Now = Date.now()
  if (Down) {
    Count = Now - LastAt < 400 && Math.hypot(Px - LastX, Py - LastY) < 6 ? Count + 1 : 1
    LastAt = Now
    LastX = Px
    LastY = Py
    Held[Number] = true
  } else delete Held[Number]
  const Event = $.CGEventCreateMouseEvent(Source, Down ? Types[0] : Types[1], $.CGPointMake(Px, Py), Math.min(Number, 2))
  $.CGEventSetIntegerValueField(Event, 1, Count)
  Post(Event)
}
const Handle = (Line) => {
  const Part = Line.split(' ')
  const Kind = Part[0]
  if (Kind === 'M') Move(Number(Part[1]), Number(Part[2]))
  else if (Kind === 'R') {
    const Dx = Number(Part[1])
    const Dy = Number(Part[2])
    const At = Here()
    Move(Clamp(At.x + Dx, Bounds.origin.x, Bounds.origin.x + Bounds.size.width), Clamp(At.y + Dy, Bounds.origin.y, Bounds.origin.y + Bounds.size.height), Math.round(Dx), Math.round(Dy))
  }
  else if (Kind === 'B') Press(Number(Part[1]), Part[2] === '1')
  else if (Kind === 'W') Post($.CGEventCreateScrollWheelEvent2(Source, 0, 2, Math.round(Number(Part[2])), Math.round(Number(Part[1])), 0))
  else if (Kind === 'K') {
    const Code = Number(Part[1])
    const Down = Part[2] === '1'
    if (Flags[Code]) Mask = Down ? Mask | Flags[Code] : Mask & ~Flags[Code]
    Post($.CGEventCreateKeyboardEvent(Source, Code, Down))
  }
}
const In = $.NSFileHandle.fileHandleWithStandardInput
let Rest = ''
for (;;) {
  const Data = In.availableData
  if (Number(Data.length) === 0) break
  const Text = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(Data, 4))
  const Lines = (Rest + Text).split('\\n')
  Rest = Lines.pop()
  for (const Line of Lines) if (Line) { try { Handle(Line) } catch (Error) {} }
}
`

const Shell = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Aim {
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int dx; public int dy; public uint data; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct KI { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct UN { [FieldOffset(0)] public MI mi; [FieldOffset(0)] public KI ki; }
  [StructLayout(LayoutKind.Sequential)] public struct IN { public uint type; public UN u; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, IN[] i, int size);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public static void Mouse(uint flags, uint data) { IN[] i = new IN[1]; i[0].type = 0; i[0].u.mi.flags = flags; i[0].u.mi.data = data; SendInput(1, i, Marshal.SizeOf(typeof(IN))); }
  public static void Rel(int dx, int dy) { IN[] i = new IN[1]; i[0].type = 0; i[0].u.mi.dx = dx; i[0].u.mi.dy = dy; i[0].u.mi.flags = 1; SendInput(1, i, Marshal.SizeOf(typeof(IN))); }
  public static void Key(ushort scan, bool ext, bool down) { IN[] i = new IN[1]; i[0].type = 1; i[0].u.ki.scan = scan; i[0].u.ki.flags = (uint)(8 | (ext ? 1 : 0) | (down ? 0 : 2)); SendInput(1, i, Marshal.SizeOf(typeof(IN))); }
}
"@
[Aim]::SetProcessDPIAware() | Out-Null
$Down = @(2, 8, 32)
$Up = @(4, 16, 64)
while (($Line = [Console]::In.ReadLine()) -ne $null) {
  $P = $Line.Split(' ')
  switch ($P[0]) {
    'M' { [Aim]::SetCursorPos([int][double]$P[1], [int][double]$P[2]) | Out-Null }
    'R' { [Aim]::Rel([int][double]$P[1], [int][double]$P[2]) }
    'B' { $N = [Math]::Min([int]$P[1], 2); if ($P[2] -eq '1') { [Aim]::Mouse($Down[$N], 0) } else { [Aim]::Mouse($Up[$N], 0) } }
    'W' { if ([int][double]$P[2] -ne 0) { [Aim]::Mouse(2048, [uint32][int](([int][double]$P[2]) * 120 / 100)) } }
    'K' { $C = [int]$P[1]; [Aim]::Key([uint16]($C -band 255), (($C -band 256) -ne 0), ($P[2] -eq '1')) }
  }
}
`

const State = { Child: null, Last: 0 }

const Stop = () => {
  if (State.Child) State.Child.kill()
  State.Child = null
}

const Open = () => {
  if (State.Child) return State.Child
  const Mac = process.platform === 'darwin'
  const File = path.join(app.getPath('temp'), Mac ? 'AeronXInput.js' : 'AeronXInput.ps1')
  Write(File, Mac ? Script : Shell)
  State.Child = Mac
    ? Spawn('osascript', ['-l', 'JavaScript', File], { stdio: ['pipe', 'ignore', 'ignore'] })
    : Spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', File], { stdio: ['pipe', 'ignore', 'ignore'] })
  State.Child.on('exit', () => {
    State.Child = null
  })
  State.Child.stdin.on('error', () => {})
  return State.Child
}

const Aim = (U, V, Display, Fill) => {
  const Sw = Display.size.width
  const Sh = Display.size.height
  const Fit = Fill ? Math.max(Width / Sw, Height / Sh) : Math.min(Width / Sw, Height / Sh)
  const Cw = Sw * Fit
  const Ch = Sh * Fit
  const X = Math.min(Sw - 1, Math.max(0, ((U * Width - (Width - Cw) / 2) / Cw) * Sw))
  const Y = Math.min(Sh - 1, Math.max(0, ((V * Height - (Height - Ch) / 2) / Ch) * Sh))
  const Point = { x: Math.round(Display.bounds.x + X), y: Math.round(Display.bounds.y + Y) }
  return process.platform === 'win32' ? screen.dipToScreenPoint(Point) : Point
}

const Line = (Event, Display, Fill) => {
  const Mac$ = process.platform === 'darwin'
  const Fit = Fill ? Math.max(Width / Display.size.width, Height / Display.size.height) : Math.min(Width / Display.size.width, Height / Display.size.height)
  const Scale = (1 / Fit) * (Mac$ ? 1 : Display.scaleFactor)
  if (Event.T === 'm') {
    const Point = Aim(Event.U, Event.V, Display, Fill)
    return `M ${Point.x} ${Point.y}`
  }
  if (Event.T === 'd') return `R ${Event.X * Scale} ${Event.Y * Scale}`
  if (Event.T === 'b') return `B ${Event.N} ${Event.D ? 1 : 0}`
  if (Event.T === 'w') return `W ${-Event.X} ${-Event.Y}`
  if (Event.T === 'k') {
    const Code = (Mac$ ? Mac : Win)[Event.C]
    return Code === undefined ? '' : `K ${Code} ${Event.D ? 1 : 0}`
  }
  return ''
}

export const Apply = (Events, Display, Fill) => {
  if (!Array.isArray(Events)) return 0
  const Fresh = Events.filter((Event) => Event && Event.S > State.Last).sort((A, B) => A.S - B.S)
  if (!Fresh.length) return 0
  State.Last = Fresh[Fresh.length - 1].S
  const Text = Fresh.map((Event) => Line(Event, Display, Fill)).filter(Boolean)
  if (Text.length) Open().stdin.write(Text.join('\n') + '\n')
  return Text.length
}

export const Reset = () => {
  State.Last = 0
}

export const Close = Stop
