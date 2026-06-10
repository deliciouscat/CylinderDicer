import type { GameBridgeMessage } from '@shared/protocol/game-bridge'

const FROM_DEFOLD_EVENT = 'CylinderDicerFromDefold'
const VUE_SOURCE = 'CylinderDicerVue'

export function sendToDefold(frame: HTMLIFrameElement, message: GameBridgeMessage) {
  frame.contentWindow?.postMessage(
    {
      source: VUE_SOURCE,
      ...message,
    },
    '*',
  )
}

export function listenFromDefold(handler: (message: GameBridgeMessage) => void) {
  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<GameBridgeMessage>
    handler(customEvent.detail)
  }

  window.addEventListener(FROM_DEFOLD_EVENT, handleCustomEvent)

  return () => {
    window.removeEventListener(FROM_DEFOLD_EVENT, handleCustomEvent)
  }
}
