import Button from '../Parts/Button.jsx'
import { Width, Height } from '../Uni/Wire.js'
import Shards from '../Uni/Shards.json'

const Allowed = { granted: 'Granted', denied: 'Denied', 'not-determined': 'Not asked yet', restricted: 'Restricted', unknown: 'Unknown' }

export default function Connect({ Info, Links, Saved, Access, Login, Pad, Fill, Toggle, Save, Allow, Start, Switch, Trust, Shape }) {
  return (
    <div className="Wrap">
      <h1 className="Title">Mirror</h1>
      <p className="Sub">Show this whole screen on any device.</p>

      <h2 className="Group" style={{ marginTop: 32 }}>
        Status
      </h2>
      <div className="List">
        <div className="Row">
          <span className="Dot" data-state={Info.Dot} />
          <div className="Text">
            <span className="Name">{Info.Label}</span>
            <span className="Meta">{Info.Live ? 'Your screen and sound are streaming' : 'Nothing is being shared'}</span>
          </div>
          <Button Main={!Info.Live} Label={Info.Live ? 'Stop mirroring' : 'Start mirroring'} Press={Toggle} />
        </div>
      </div>

      <h2 className="Group">Receiver</h2>
      <div className="List">
        <div className="Row">
          <div className="Text">
            <span className="Name">AeronX.html</span>
            <span className="Meta">{Saved || 'One file, tied to this computer. Open it on any device.'}</span>
          </div>
          <Button Label="Save file" Press={Save} />
        </div>
      </div>

      <h2 className="Group">Permissions</h2>
      <div className="List">
        <div className="Row">
          <div className="Text">
            <span className="Name">Screen recording</span>
            <span className="Meta">Needed to mirror your screen</span>
          </div>
          <span className="Value">{Allowed[Access] || Access}</span>
          {Access !== 'granted' ? <Button Label="Allow" Press={Allow} /> : null}
        </div>
      </div>

      <h2 className="Group">Display</h2>
      <div className="List">
        <div className="Row">
          <div className="Text">
            <span className="Name">Screen fit</span>
            <span className="Meta">{Fill ? 'Fills the frame. Crops a little off the top and bottom of taller screens.' : 'Shows your whole screen. Adds black bars on screens that are not 16:9.'}</span>
          </div>
          <span className="Value">{Fill ? 'Fill' : 'Whole screen'}</span>
          <Button Label={Fill ? 'Show whole screen' : 'Fill frame'} Press={Shape} />
        </div>
      </div>

      <h2 className="Group">Control</h2>
      <div className="List">
        <div className="Row">
          <div className="Text">
            <span className="Name">Remote control</span>
            <span className="Meta">Let your receiver move the mouse and press keys</span>
          </div>
          <span className="Value">{Pad.On ? 'On' : 'Off'}</span>
          <Button Main={!Pad.On} Label={Pad.On ? 'Turn off' : 'Turn on'} Press={Switch} />
        </div>
        {Pad.On && !Pad.Trusted ? (
          <div className="Row">
            <div className="Text">
              <span className="Name">Accessibility</span>
              <span className="Meta">Needed to send input to your computer</span>
            </div>
            <span className="Value">Needed</span>
            <Button Label="Allow" Press={Trust} />
          </div>
        ) : null}
      </div>

      {Login === null ? null : (
        <>
          <h2 className="Group">Startup</h2>
          <div className="List">
            <div className="Row">
              <div className="Text">
                <span className="Name">Open at login</span>
                <span className="Meta">Starts in the background and resumes mirroring</span>
              </div>
              <span className="Value">{Login ? 'On' : 'Off'}</span>
              <Button Label={Login ? 'Turn off' : 'Turn on'} Press={Start} />
            </div>
          </div>
        </>
      )}

      <h2 className="Group">Details</h2>
      <div className="List">
        <div className="Row">
          <div className="Text">
            <span className="Name">Links</span>
          </div>
          <span className="Value">
            {Links} of {Shards.length}
          </span>
        </div>
        <div className="Row">
          <div className="Text">
            <span className="Name">Quality</span>
          </div>
          <span className="Value">
            {Width} × {Height}
          </span>
        </div>
      </div>
    </div>
  )
}
