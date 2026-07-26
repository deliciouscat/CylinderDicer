const FROM_DEFOLD_EVENT = 'CylinderDicerFromDefold';
const VUE_SOURCE = 'CylinderDicerVue';
const DEFOLD_SOURCE = 'CylinderDicerDefold';
export function sendToDefold(frame, message) {
    try {
        const target = frame.contentWindow;
        if (typeof target?.CylinderDicerSendToDefold === 'function') {
            target.CylinderDicerSendToDefold(message);
            return;
        }
    }
    catch {
        // Cross-origin or not-yet-ready frames fall back to postMessage.
    }
    frame.contentWindow?.postMessage({
        source: VUE_SOURCE,
        ...message,
    }, '*');
}
export function listenFromDefold(handler) {
    const handleCustomEvent = (event) => {
        const customEvent = event;
        handler(customEvent.detail);
    };
    const handleMessageEvent = (event) => {
        const data = event.data;
        if (!data || data.source !== DEFOLD_SOURCE || !data.type) {
            return;
        }
        handler({
            type: data.type,
            payload: data.payload,
        });
    };
    window.addEventListener(FROM_DEFOLD_EVENT, handleCustomEvent);
    window.addEventListener('message', handleMessageEvent);
    return () => {
        window.removeEventListener(FROM_DEFOLD_EVENT, handleCustomEvent);
        window.removeEventListener('message', handleMessageEvent);
    };
}
export function listenFromDefoldFrame(target, handler) {
    const handleCustomEvent = (event) => {
        const customEvent = event;
        handler(customEvent.detail);
    };
    target.addEventListener(FROM_DEFOLD_EVENT, handleCustomEvent);
    return () => {
        target.removeEventListener(FROM_DEFOLD_EVENT, handleCustomEvent);
    };
}
