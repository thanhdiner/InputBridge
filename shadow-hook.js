(() => {
  const FLAG = "__inputBridgeShadowHookLoaded";
  const EVENT_NAME = "__inputbridge_shadow_attached__";

  if (window[FLAG]) return;
  window[FLAG] = true;

  const originalAttachShadow = Element.prototype.attachShadow;
  if (typeof originalAttachShadow !== "function") return;

  function attachShadowWithInputBridge(init) {
    const root = originalAttachShadow.call(this, init);

    try {
      this.dispatchEvent(new CustomEvent(EVENT_NAME, {
        bubbles: true,
        composed: true,
        detail: { mode: init?.mode || "open" }
      }));
    } catch {}

    return root;
  }

  try {
    Object.defineProperty(attachShadowWithInputBridge, "name", {
      value: originalAttachShadow.name,
      configurable: true
    });
  } catch {}

  try {
    attachShadowWithInputBridge.toString = () => originalAttachShadow.toString();
  } catch {}

  Object.defineProperty(Element.prototype, "attachShadow", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: attachShadowWithInputBridge
  });
})();
