import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function ScrollManager() {
  const location = useLocation()

  useEffect(() => {
    const scroll = () => {
      if (location.hash) {
        const element = document.getElementById(location.hash.slice(1))
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
      }

      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const timer = window.setTimeout(scroll, 50)
    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search, location.hash])

  return null
}
