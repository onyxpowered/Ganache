import { useEffect } from 'react'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '../Style/Theme.css'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const Platform = navigator.userAgent.includes('Mac') ? 'mac' : navigator.userAgent.includes('Windows') ? 'win' : 'other'
    document.documentElement.dataset.platform = Platform
  }, [])
  return <Component {...pageProps} />
}
