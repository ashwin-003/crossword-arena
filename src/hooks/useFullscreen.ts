import { useCallback, useEffect, useState } from 'react'

function isDocumentFullscreen() {
  return Boolean(document.fullscreenElement)
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(isDocumentFullscreen)
  const [supported] = useState(() => typeof document.documentElement.requestFullscreen === 'function')

  useEffect(() => {
    function onChange() {
      setIsFullscreen(isDocumentFullscreen())
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen()
      return true
    } catch {
      return false
    }
  }, [])

  const exit = useCallback(async () => {
    if (isDocumentFullscreen()) {
      try {
        await document.exitFullscreen()
      } catch {
        // ignore
      }
    }
  }, [])

  return { isFullscreen, supported, enter, exit }
}
