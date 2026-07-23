import buttonClickUrl from '../../assets/sounds/sfx/button_click.mp3'

const POOL_SIZE = 4

function isEnabledButton(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  const button = target.closest<HTMLElement>('button, [role="button"]')
  if (!button) return false
  if (button instanceof HTMLButtonElement && button.disabled) return false
  return button.getAttribute('aria-disabled') !== 'true'
}

export function installButtonClickSound(root: Document = document) {
  const pool = Array.from({ length: POOL_SIZE }, () => {
    const audio = new Audio(buttonClickUrl)
    audio.preload = 'auto'
    return audio
  })
  let cursor = 0

  const handleClick = (event: MouseEvent) => {
    if (!isEnabledButton(event.target)) return
    const audio = pool[cursor]
    cursor = (cursor + 1) % pool.length
    audio.currentTime = 0
    void audio.play().catch(() => {
      // A future user activation will retry through the next real click.
    })
  }

  root.addEventListener('click', handleClick, { capture: true })
  return () => {
    root.removeEventListener('click', handleClick, { capture: true })
    for (const audio of pool) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }
}
