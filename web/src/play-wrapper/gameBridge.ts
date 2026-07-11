import type { GameBridgeMessage } from '@shared/protocol/game-bridge'

const FROM_DEFOLD_EVENT = 'CylinderDicerFromDefold'
const VUE_SOURCE = 'CylinderDicerVue'
const DEFOLD_SOURCE = 'CylinderDicerDefold'

export function sendToDefold(frame: HTMLIFrameElement, message: GameBridgeMessage) {
  try {
    const target = frame.contentWindow as (Window & {
      CylinderDicerSendToDefold?: (message: GameBridgeMessage) => void
    }) | null
    if (typeof target?.CylinderDicerSendToDefold === 'function') {
      target.CylinderDicerSendToDefold(message)
      return
    }
  } catch {
    // Cross-origin or not-yet-ready frames fall back to postMessage.
  }

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
  const handleMessageEvent = (event: MessageEvent) => {
    const data = event.data as (GameBridgeMessage & { source?: string }) | undefined
    if (!data || data.source !== DEFOLD_SOURCE || !data.type) {
      return
    }
    handler({
      type: data.type,
      payload: data.payload,
    })
  }

  window.addEventListener(FROM_DEFOLD_EVENT, handleCustomEvent)
  window.addEventListener('message', handleMessageEvent)

  return () => {
    window.removeEventListener(FROM_DEFOLD_EVENT, handleCustomEvent)
    window.removeEventListener('message', handleMessageEvent)
  }
}

export function listenFromDefoldFrame(
  target: Window,
  handler: (message: GameBridgeMessage) => void,
) {
  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<GameBridgeMessage>
    handler(customEvent.detail)
  }

  target.addEventListener(FROM_DEFOLD_EVENT, handleCustomEvent)

  return () => {
    target.removeEventListener(FROM_DEFOLD_EVENT, handleCustomEvent)
  }
}
