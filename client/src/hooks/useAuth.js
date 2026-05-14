import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

export function fixPath(value) {
  if (!value) return '/resources/lux_icon.png?v=3'
  return value.startsWith('http') ? value : `/uploads/${String(value).replace(/^\/?uploads\//, '')}`
}

export default function useAuth({ redirectOnMaintenance = true } = {}) {
  const location = useLocation()
  const [state, setState] = useState({ loading: true, loggedIn: false, user: null, error: null })

  useEffect(() => {
    let active = true

    fetch(`/api/user?_cb=${Date.now()}`)
      .then(async (response) => {
        if (response.status === 503 && redirectOnMaintenance) {
          window.location.href = '/maintenance'
          return null
        }

        if (!response.ok) {
          throw new Error('Failed to load user session')
        }

        return response.json()
      })
      .then((data) => {
        if (!active || !data) return
        setState({
          loading: false,
          loggedIn: !!data.loggedIn,
          user: data.user ?? null,
          error: null,
        })
      })
      .catch((error) => {
        if (!active) return
        setState({ loading: false, loggedIn: false, user: null, error: error.message })
      })

    return () => {
      active = false
    }
  }, [location.pathname, location.search, redirectOnMaintenance])

  const currentPath = useMemo(
    () => encodeURIComponent(`${location.pathname}${location.search}${location.hash}`),
    [location.pathname, location.search, location.hash],
  )

  return {
    ...state,
    loginUrl: `/auth/google?returnTo=${currentPath}`,
    logoutUrl: `/auth/logout?returnTo=${currentPath}`,
  }
}
