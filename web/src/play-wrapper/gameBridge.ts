import type {
  GameBridgeMessage,
  GameBridgeMessageType,
} from '@shared/protocol/game-bridge'

const FROM_DEFOLD_EVENT = 'CylinderDicerFromDefold'
const VUE_SOURCE = 'CylinderDicerVue'
const DEFOLD_SOURCE = 'CylinderDicerDefold'

const MESSAGE_TYPES = new Set<GameBridgeMessageType>([
  'DEFOLD_READY',
  'START_MATCH',
  'MATCH_READY',
  'PLAYER_COMMAND',
  'SERVER_SNAPSHOT',
  'SERVER_SNAPSHOT_RECEIVED',
  'SERVER_EVENT',
  'COMMAND_REJECTED',
  'COMMAND_REJECTED_RECEIVED',
  'SET_LOCALE',
  'LOCALE_APPLIED',
  'SET_COSMETICS',
  'COSMETICS_APPLIED',
  'SUBMIT_MATCH_RESULT',
  'INPUT_POINTER',
  'DOM_POINTER',
  'INPUT_SHAKE',
  'PING',
  'PONG',
  'QA_COMMAND',
  'QA_STATUS',
  'EXIT_TO_LOBBY',
  'UNKNOWN_MESSAGE',
])

function frameOrigin(frame: HTMLIFrameElement): string {
  return new URL(frame.src || frame.getAttribute('src') || '/', window.location.href).origin
}

function asBridgeMessage(value: unknown): GameBridgeMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (typeof record.type !== 'string' || !MESSAGE_TYPES.has(record.type as GameBridgeMessageType)) {
    return null
  }
  return {
    type: record.type as GameBridgeMessageType,
    ...(Object.hasOwn(record, 'payload') ? { payload: record.payload } : {}),
  }
}

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
    frameOrigin(frame),
  )
}

export function listenFromDefold(
  frame: HTMLIFrameElement,
  handler: (message: GameBridgeMessage) => void,
) {
  const expectedWindow = frame.contentWindow
  const expectedOrigin = frameOrigin(frame)
  const handleMessageEvent = (event: MessageEvent) => {
    if (event.source !== expectedWindow || event.origin !== expectedOrigin) {
      return
    }
    const data = event.data as Record<string, unknown> | undefined
    if (!data || data.source !== DEFOLD_SOURCE) {
      return
    }
    const message = asBridgeMessage(data)
    if (message) {
      handler(message)
    }
  }

  window.addEventListener('message', handleMessageEvent)

  return () => {
    window.removeEventListener('message', handleMessageEvent)
  }
}

export function listenFromDefoldFrame(
  target: Window,
  handler: (message: GameBridgeMessage) => void,
) {
  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<unknown>
    const message = asBridgeMessage(customEvent.detail)
    if (message) {
      handler(message)
    }
  }

  target.addEventListener(FROM_DEFOLD_EVENT, handleCustomEvent)

  return () => {
    target.removeEventListener(FROM_DEFOLD_EVENT, handleCustomEvent)
  }
}
