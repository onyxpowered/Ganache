import { useEffect, useState } from 'react'
import Head from '../Parts/Head.jsx'
import Connect from '../Screens/Connect.jsx'

const Read = (Status) => {
  if (Status === 'Idle') return { Label: 'Offline', Dot: '', Live: false }
  if (Status === 'Online') return { Label: 'Mirroring', Dot: 'Live', Live: true }
  if (Status === 'NoShards') return { Label: 'No links available', Dot: 'Bad', Live: false }
  return { Label: Status.replace('Failed: ', ''), Dot: 'Bad', Live: false }
}

export default function Home() {
  const [Status, SetStatus] = useState('Idle')
  const [Links, SetLinks] = useState(0)
  const [Saved, SetSaved] = useState('')
  const [Access, SetAccess] = useState('unknown')
  const [Login, SetLogin] = useState(null)
  const [Pad, SetPad] = useState({ On: false, Trusted: true })
  const [Fill, SetFill] = useState(true)

  useEffect(
    () =>
      window.Aeron.Status((Message) => {
        if (Message.startsWith('Links:')) SetLinks(Number(Message.slice(6)))
        else SetStatus(Message)
      }),
    []
  )

  useEffect(() => {
    window.Aeron.Access().then(SetAccess)
    window.Aeron.Login().then(SetLogin)
    window.Aeron.Control().then(SetPad)
    window.Aeron.Fill().then(SetFill)
  }, [])

  const Info = Read(Status)

  return (
    <>
      <Head Dot={Info.Dot} Label={Info.Label} />
      <div className="Scroll">
        <Connect
          Info={Info}
          Links={Links}
          Saved={Saved}
          Access={Access}
          Login={Login}
          Pad={Pad}
          Fill={Fill}
          Shape={async () => SetFill(await window.Aeron.Fill(!Fill))}
          Switch={async () => SetPad(await window.Aeron.Control(!Pad.On))}
          Trust={async () => SetPad({ ...Pad, Trusted: await window.Aeron.Trust() })}
          Start={async () => SetLogin(await window.Aeron.Login(!Login))}
          Toggle={() => (Info.Live ? window.Aeron.Offline() : window.Aeron.Online())}
          Save={async () => SetSaved((await window.Aeron.Receiver()) || '')}
          Allow={async () => SetAccess(await window.Aeron.Allow())}
        />
      </div>
    </>
  )
}
