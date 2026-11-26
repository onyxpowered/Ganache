import { build as Build } from 'esbuild'
import { readFileSync as Read, writeFileSync as Write } from 'fs'

const Result = await Build({
  entryPoints: ['renderer/Uni/Page.js'],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  loader: { '.json': 'json' },
})

const Bundle = Result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
const Theme = Read('renderer/Style/Theme.css', 'utf8')

const Face = (Family, File) =>
  `@font-face{font-family:'${Family}';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${Read(File).toString('base64')}) format('woff2')}`

const Fonts =
  Face('Geist Variable', 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2') +
  Face('Geist Mono Variable', 'node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2')

const Extra = `body{min-height:100vh}html,body{background:#000}#Screen{display:block;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(100vw,calc(100vh*16/9));height:min(100vh,calc(100vw*9/16));background:#000}#Start{position:fixed;inset:0;margin:auto;width:160px;height:40px}.Head{-webkit-app-region:no-drag}#Hint{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:6px 12px;border:1px solid var(--Gray400);border-radius:var(--Radius);background:var(--Bg2);color:var(--Gray900);font-size:12px;pointer-events:none}`

const Body = `<div id="Menu" hidden><header class="Head"><span class="Word">AeronX</span><div class="State"><span class="Dot" id="Pulse"></span><span id="State">Connecting</span></div></header><main class="Wrap"><h1 class="Title">AeronX</h1><p class="Sub" id="Copy"></p></main></div><canvas id="Screen" hidden></canvas><div id="Hint" hidden></div><button id="Start" class="Button" data-kind="Main">Connect</button>`

const Html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AeronX</title><style>${Fonts}${Theme}${Extra}</style></head><body>${Body}<script>window.Session=__SESSION__</script><script>${Bundle}</script></body></html>`

Write('main/Template.js', `export const Template = ${JSON.stringify(Html)}\n`)
