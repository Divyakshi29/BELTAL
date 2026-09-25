import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Shared modal accessibility behavior:
 *  - moves focus into the dialog when it opens
 *  - traps Tab/Shift+Tab within the dialog while it's open
 *  - closes on Escape
 *  - returns focus to whatever triggered the dialog when it closes/unmounts
 *
 * Usage: const dialogRef = useModalA11y(onClose)
 * Attach the returned ref to the dialog's outermost element (the one with role="dialog").
 */
export default function useModalA11y(onClose) {
  const dialogRef = useRef(null)
  const previouslyFocusedRef = useRef(null)
  const onCloseRef = useRef(onClose)

  // Callers often pass an inline handler; reading it through a ref keeps the
  // effect below from re-running (and re-stealing focus) on every render.
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement

    const node = dialogRef.current
    const focusables = node ? node.querySelectorAll(FOCUSABLE_SELECTOR) : []
    const firstFocusable = focusables[0]
    if (firstFocusable) {
      firstFocusable.focus()
    } else if (node) {
      node.setAttribute('tabindex', '-1')
      node.focus()
    }

    const handleKeyDown = e => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      ).filter(el => el.offsetParent !== null)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocusedRef.current instanceof HTMLElement) {
        previouslyFocusedRef.current.focus()
      }
    }
  }, [])

  return dialogRef
}
