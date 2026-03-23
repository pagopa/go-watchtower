'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Manages a local input value that is debounced before propagating to a parent
 * callback. Syncs the local value when the external `value` changes (e.g. on
 * product switch), using the React 19 render-time state-adjustment pattern.
 */
export function useDebouncedInput(
  externalValue: string,
  onCommit: (value: string) => void,
  delay = 400,
) {
  const [localValue, setLocalValue] = useState(externalValue)
  const [prevExternal, setPrevExternal] = useState(externalValue)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCommitRef = useRef(onCommit)

  // Keep the callback ref fresh so the timer always fires the latest version.
  useEffect(() => { onCommitRef.current = onCommit })

  // Sync when external value changes (render-time adjustment, React 19 safe)
  if (prevExternal !== externalValue) {
    setPrevExternal(externalValue)
    setLocalValue(externalValue)
  }

  const handleChange = useCallback(
    (value: string) => {
      setLocalValue(value)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onCommitRef.current(value), delay)
    },
    [delay],
  )

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setLocalValue('')
  }, [])

  // Cleanup on unmount
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { value: localValue, onChange: handleChange, reset } as const
}
