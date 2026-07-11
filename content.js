(() => {
  const INPUTBRIDGE_FLAG = "__inputBridgeLoaded";
  if (window[INPUTBRIDGE_FLAG]) return;
  window[INPUTBRIDGE_FLAG] = true;

  const LANGUAGE_CATALOG = globalThis.InputBridgeLanguageCatalog;

  const SKIP_INPUT_TYPES = new Set([
    "password",
    "email",
    "tel",
    "number",
    "url",
    "date",
    "datetime-local",
    "month",
    "week",
    "time",
    "color",
    "file",
    "range",
    "checkbox",
    "radio",
    "submit",
    "button",
    "hidden"
  ]);

  const SHADOW_ATTACHED_EVENT = "__inputbridge_shadow_attached__";
  const observedRoots = new WeakSet();
  const rootObservers = new WeakMap();
  const inlineSelectOwners = new WeakSet();

  const BOOT_SETTINGS = {
    enabled: true,
    targetLanguage: "English",
    mode: "translate",
    tone: "natural",
    autoMode: "autoOnSend",
    livePreview: true,
    debounceMs: 700,
    minChars: 1,
    acceptWithTab: true,
    showBackTranslation: true,
    selectionTranslation: true,
    selectionTrigger: "icon",
    selectionShiftTranslate: true,
    selectionAllowEditable: false,
    selectionMinChars: 2,
    selectionMaxChars: 1000,
    selectionCardTheme: "light"
  };

  let settings = { ...BOOT_SETTINGS };
  let activeEl = null;
  let previewEl = null;
  let toastEl = null;
  let debounceTimer = null;
  let typingDelayTimer = null;
  let autoReplaceTimer = null;
  let isComposing = false;
  let requestSeq = 0;
  let currentPreview = null;
  let lastOriginal = "";
  let lastApplied = null;
  let lastAppliedTimer = null;
  let suppressNextInput = false;
  let showSettingsPanel = false;
  let sendInProgress = false;
  let bypassNextSendClick = false;
  let previewInteractionUntil = 0;
  let suppressTransformUntil = 0;
  let selectionIconEl = null;
  let selectionCardEl = null;
  let selectionState = null;
  let selectionTimer = null;
  let selectionValidationTimer = null;
  let selectionRequestSeq = 0;
  let selectionInteractionUntil = 0;
  let selectionSettingsOpen = false;
  let selectionExplanation = "";
  let selectionExplanationLoading = false;
  let selectionExplanationError = "";
  let selectionIsFavorite = false;
  let selectionCardPlacement = "";

  init();

  function init() {
    attachGlobalListeners();
    observeEventRoot(document);
    scanForOpenShadowRoots(document);
    primeActiveElement("boot");

    getSettings().then((next) => {
      settings = { ...BOOT_SETTINGS, ...(next || {}) };
      primeActiveElement("settings-loaded");
    }).catch(() => {
      primeActiveElement("settings-fallback");
    });
  }

  function primeActiveElement(reason) {
    const el = findEditable(getDeepActiveElement());
    if (!el) return;

    activeEl = el;
    lastOriginal = getEditableText(el);
    currentPreview = null;

    const text = lastOriginal.trim();
    if (shouldProcess(text)) scheduleTransform(reason);
  }

  function attachGlobalListeners() {
    window.addEventListener("scroll", onViewportScroll, true);
    window.addEventListener("resize", repositionAll, true);

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "IB_SETTINGS_UPDATED") refreshSettings("settings-updated");
    });

    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === "sync" && Object.keys(changes || {}).length) {
        refreshSettings("storage-updated");
      }
    });
  }

  function refreshSettings(reason) {
    getSettings().then((next) => {
      settings = { ...BOOT_SETTINGS, ...(next || {}) };
      hidePreview();
      if (!settings.enabled || !settings.selectionTranslation) hideSelectionUi();
      primeActiveElement(reason);
    }).catch(() => {});
  }

  function observeEventRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);

    const bind = (type, handler, options = true) => {
      root.addEventListener(type, (event) => {
        if (!shouldHandleEventAtRoot(root, event)) return;
        handler(event);
      }, options);
    };

    bind(SHADOW_ATTACHED_EVENT, onShadowAttached);
    bind("focusin", onFocusIn);
    bind("focusout", onFocusOut);
    bind("input", onInput);
    bind("keydown", onKeyDown);
    bind("click", onDocumentClick);
    bind("pointerdown", (event) => onSelectionPointerDown(event, root));
    bind("pointerup", (event) => onSelectionPointerUp(event, root));
    bind("keyup", (event) => onSelectionKeyUp(event, root));
    root.addEventListener("selectionchange", () => onSelectionChange(root), true);
    bind("compositionstart", () => { isComposing = true; });
    bind("compositionend", () => {
      isComposing = false;
      scheduleTransform("compositionend");
    });

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) scanForOpenShadowRoots(node);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    rootObservers.set(root, observer);
    if (root instanceof ShadowRoot) scanForOpenShadowRoots(root);
  }

  function shouldHandleEventAtRoot(root, event) {
    const path = event.composedPath?.() || [];
    const innermostShadowRoot = path.find((node) => node instanceof ShadowRoot) || null;
    if (root === document) return !innermostShadowRoot;
    return innermostShadowRoot === root;
  }

  function onShadowAttached(event) {
    const host = event.target instanceof Element ? event.target : null;
    if (host?.shadowRoot) observeEventRoot(host.shadowRoot);
  }

  function scanForOpenShadowRoots(startNode) {
    if (!startNode) return;

    const inspect = (node) => {
      if (!(node instanceof Element)) return;
      if (node.shadowRoot) observeEventRoot(node.shadowRoot);
    };

    if (startNode instanceof Element) inspect(startNode);
    const scope = startNode instanceof Document || startNode instanceof ShadowRoot || startNode instanceof Element
      ? startNode
      : null;
    if (!scope?.querySelectorAll) return;
    for (const el of scope.querySelectorAll("*")) inspect(el);
  }

  function getDeepActiveElement() {
    let current = document.activeElement;
    while (current?.shadowRoot?.activeElement) current = current.shadowRoot.activeElement;
    return current;
  }

  function isEditorActive(editor) {
    const focused = getDeepActiveElement();
    return Boolean(editor && focused && (focused === editor || editor.contains?.(focused)));
  }

  function onFocusIn(event) {
    const el = findEditable(event.target);
    if (!el) return;
    activeEl = el;
    lastOriginal = getEditableText(el);
    currentPreview = null;
    scheduleTransform("focus");
  }

  function onFocusOut() {
    window.setTimeout(() => {
      if (sendInProgress) return;
      if (Date.now() < previewInteractionUntil) return;

      const focused = getDeepActiveElement();
      if (previewEl?.contains(focused)) return;
      if (activeEl && isEditorActive(activeEl)) return;

      if (!focused || !findEditable(focused)) {
        activeEl = null;
        currentPreview = null;
        requestSeq += 1;
        clearTimers();
        hidePreview();
      }
    }, 160);
  }

  function onInput(event) {
    const el = findEditable(event.target);
    if (!el) return;

    if (el !== activeEl) {
      activeEl = el;
      currentPreview = null;
      lastOriginal = getEditableText(el);
    }

    if (suppressNextInput) {
      suppressNextInput = false;
      return;
    }

    currentPreview = null;
    lastOriginal = getEditableText(el);
    const text = lastOriginal.trim();

    if (!shouldProcess(text)) {
      requestSeq += 1;
      clearTimers();
      hidePreview();
      return;
    }

    scheduleTransform("input");
  }

  async function onKeyDown(event) {
    if (event.key === "Escape") {
      const target = event.target instanceof Element ? event.target : null;
      const openSelect = target?.closest?.(".ib-custom-select.is-open") ||
        selectionCardEl?.querySelector?.(".ib-custom-select.is-open") ||
        previewEl?.querySelector?.(".ib-custom-select.is-open");

      if (openSelect) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeInlineSelect(openSelect, { clearSearch: true, focusTrigger: true });
        if (selectionCardEl?.contains(openSelect)) positionSelectionUi({ preserveCardPlacement: true });
        else positionPreview();
        return;
      }

      hideSelectionUi();
      hidePreview();
      return;
    }

    const eventEl = findEditable(event.target);
    if (eventEl && eventEl !== activeEl) activeEl = eventEl;
    if (!activeEl || !settings?.enabled) return;

    if (event.ctrlKey && event.key.toLowerCase() === "z" && lastApplied) {
      restoreLastApplied();
      return;
    }

    if (settings.acceptWithTab && event.key === "Tab" && currentPreview?.result) {
      event.preventDefault();
      applyPreview("tab");
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && settings.autoMode === "autoOnSend") {
      const text = getEditableText(activeEl).trim();
      if (!shouldProcess(text) || sendInProgress) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      await handleSendIntent({ source: "enter", editable: activeEl });
    }
  }

  function onDocumentClick(event) {
    if (!settings?.enabled || settings.autoMode !== "autoOnSend" || sendInProgress) return;
    if (bypassNextSendClick) {
      bypassNextSendClick = false;
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(".ib-preview-card, .ib-toast, .ib-selection-icon, .ib-selection-card")) return;

    const control = target.closest('button, [role="button"], input[type="submit"]');
    if (!control || !isLikelySendControl(control, activeEl)) return;

    const editable = activeEl || findEditable(getDeepActiveElement());
    const text = editable ? getEditableText(editable).trim() : "";
    if (!editable || !shouldProcess(text)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    void handleSendIntent({ source: "click", editable, sendControl: control });
  }

  async function handleSendIntent({ source, editable, sendControl = null }) {
    if (sendInProgress || !editable) return false;

    const originalText = getEditableText(editable).trim();
    if (!shouldProcess(originalText)) return false;

    sendInProgress = true;
    clearTimers();
    showToast("Đang dịch trước khi gửi...");

    try {
      const preview = currentPreview?.original === originalText && currentPreview?.result
        ? currentPreview
        : await requestTransform(originalText, "send", editable);

      if (!preview?.result) {
        showToast("Dịch lỗi, chưa gửi tin nhắn.");
        return false;
      }

      suppressTransformUntil = Date.now() + 700;
      setEditableText(editable, preview.result);
      await waitForEditableCommit(editable, preview.result);
      clearTimers();
      hidePreview();

      const control = sendControl?.isConnected ? sendControl : findLikelySendButton(editable);
      if (control) {
        bypassNextSendClick = true;
        control.click();
        showToast("Đã gửi bản dịch.");
        return true;
      }

      const form = editable.closest("form");
      if (form?.requestSubmit) {
        form.requestSubmit();
        showToast("Đã gửi bản dịch.");
        return true;
      }

      showToast(source === "enter"
        ? "Đã thay bằng bản dịch. Bấm Enter thêm lần nữa để gửi."
        : "Đã thay bằng bản dịch nhưng chưa tìm thấy nút gửi.");
      return false;
    } finally {
      window.setTimeout(() => { sendInProgress = false; }, 120);
    }
  }

  function waitForEditableCommit(editable, expectedText) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.setTimeout(() => {
            if (getEditableText(editable).trim() !== String(expectedText).trim()) {
              setEditableText(editable, expectedText);
            }
            resolve();
          }, 40);
        });
      });
    });
  }

  function scheduleTransform(reason) {
    if (!settings?.enabled || !activeEl || !settings.livePreview) return;
    if (isComposing || Date.now() < suppressTransformUntil) return;

    clearTimeout(debounceTimer);
    clearTimeout(typingDelayTimer);
    clearTimeout(autoReplaceTimer);

    const text = getEditableText(activeEl).trim();
    if (!shouldProcess(text)) {
      hidePreview();
      return;
    }

    typingDelayTimer = window.setTimeout(() => {
      const latest = activeEl ? getEditableText(activeEl).trim() : "";
      if (latest === text && shouldProcess(latest) && isEditorActive(activeEl)) {
        renderTypingIndicator();
      }
    }, 220);

    debounceTimer = window.setTimeout(async () => {
      const preview = await requestTransform(text, reason);
      if (preview && settings.autoMode === "autoReplace") {
        const delay = 450;
        autoReplaceTimer = window.setTimeout(() => {
          const latest = getEditableText(activeEl).trim();
          if (latest === preview.original && isEditorActive(activeEl)) {
            applyPreview("autoReplace");
          }
        }, delay);
      }
    }, Number(settings.debounceMs || 700));
  }

  async function requestTransform(text, reason, sourceEl = activeEl) {
    const originalAtRequest = text;
    const seq = ++requestSeq;
    if (sourceEl && !activeEl) activeEl = sourceEl;
    renderTypingIndicator();

    const response = await sendMessage({
      type: "IB_TRANSFORM",
      text: originalAtRequest,
      mode: settings.mode,
      tone: settings.tone,
      targetLanguage: settings.targetLanguage,
      origin: getPageOrigin(),
      contextHint: getContextHint()
    });

    if (seq !== requestSeq) return null;

    const validationEl = sourceEl?.isConnected ? sourceEl : activeEl;
    const latest = validationEl ? getEditableText(validationEl).trim() : "";
    if (
      !validationEl ||
      normalizeEditableText(latest) !== normalizeEditableText(originalAtRequest) ||
      !shouldProcess(latest)
    ) {
      hidePreview();
      return null;
    }

    if (!response?.ok) {
      renderPreview({
        original: originalAtRequest,
        result: response?.error || "InputBridge lỗi.",
        backTranslation: "",
        warnings: [],
        status: "Error"
      });
      return null;
    }

    const data = response.data || {};
    const preview = {
      original: originalAtRequest,
      result: String(data.result || ""),
      backTranslation: String(data.backTranslation || ""),
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      tone: data.tone || settings.tone,
      demo: Boolean(response.demo),
      status: response.demo ? "Demo" : reason === "send" ? "Ready to send" : "Preview"
    };

    currentPreview = preview;
    renderPreview(preview);
    return preview;
  }

  function handlePreviewMouseDown(event) {
    const target = event.target instanceof Element ? event.target : null;
    const isInteractive = Boolean(target?.closest("input, select, textarea, option, button, [contenteditable='true']"));
    const isSelectableText = Boolean(target?.closest(".ib-result, .ib-back, .ib-warning"));

    previewInteractionUntil = Date.now() + 1200;
    event.stopPropagation();
    if (!isInteractive && !isSelectableText) event.preventDefault();
  }

  function renderTypingIndicator() {
    if (!activeEl) return;
    if (!previewEl) {
      previewEl = document.createElement("div");
      previewEl.className = "ib-preview-card";
      previewEl.addEventListener("mousedown", handlePreviewMouseDown);
      document.documentElement.appendChild(previewEl);
    }

    previewEl.className = "ib-preview-card ib-typing-card";
    previewEl.innerHTML = `
      <div class="ib-typing-row" aria-label="InputBridge đang xử lý">
        <span class="ib-typing-label">Đang xử lý</span>
        <span class="ib-typing-dots" aria-hidden="true">
          <i></i><i></i><i></i>
        </span>
      </div>
    `;
    previewEl.style.display = "block";
    positionPreview();
  }

  function renderPreview(preview, compact = false) {
    if (!activeEl) return;
    if (preview?.status === "Thinking" || preview?.result === "Đang xử lý...") {
      renderTypingIndicator();
      return;
    }
    if (!preview?.result) {
      hidePreview();
      return;
    }
    if (!previewEl) {
      previewEl = document.createElement("div");
      previewEl.className = "ib-preview-card";
      previewEl.addEventListener("mousedown", handlePreviewMouseDown);
      document.documentElement.appendChild(previewEl);
    }

    const resultLength = String(preview.result || "").trim().length;
    const sizeClass = showSettingsPanel
      ? ""
      : resultLength <= 40
        ? "ib-micro"
        : (compact || resultLength <= 110)
          ? "ib-compact"
          : "";
    previewEl.className = `ib-preview-card ${sizeClass}`;
    const warnings = (preview.warnings || []).slice(0, 2).map(escapeHtml).join(" · ");
    const back = settings?.showBackTranslation && preview.backTranslation && showSettingsPanel
      ? `<div class="ib-back"><b>Nghĩa ngược:</b> ${escapeHtml(preview.backTranslation)}</div>`
      : "";
    const warningText = (warnings && showSettingsPanel)
      ? `<div class="ib-warning">${warnings}</div>`
      : "";

    previewEl.innerHTML = `
      <button class="ib-card-close" data-ib-action="close" type="button" title="Close" aria-label="Close preview">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
      </button>
      <div class="ib-preview-body" style="padding: 12px 12px 10px;">
        <p class="ib-result">${escapeHtml(preview.result || "")}</p>
        
        <div class="ib-settings-panel" style="display: ${showSettingsPanel ? 'block' : 'none'};">
          <div class="ib-settings-grid">
            <div>
              <span class="ib-settings-label">Mode</span>
              <select id="ib-inline-mode" class="ib-select">
                <option value="translate" ${settings.mode === 'translate' ? 'selected' : ''}>Translate</option>
                <option value="polish" ${settings.mode === 'polish' ? 'selected' : ''}>Polish</option>
                <option value="clarify" ${settings.mode === 'clarify' ? 'selected' : ''}>Clarify</option>
              </select>
            </div>
            <div>
              <span class="ib-settings-label">Tone</span>
              <select id="ib-inline-tone" class="ib-select">
                <option value="natural" ${settings.tone === 'natural' ? 'selected' : ''}>Natural</option>
                <option value="casual" ${settings.tone === 'casual' ? 'selected' : ''}>Casual</option>
                <option value="neutral" ${settings.tone === 'neutral' ? 'selected' : ''}>Neutral</option>
                <option value="professional" ${settings.tone === 'professional' ? 'selected' : ''}>Professional</option>
                <option value="polite" ${settings.tone === 'polite' ? 'selected' : ''}>Polite</option>
                <option value="direct" ${settings.tone === 'direct' ? 'selected' : ''}>Direct</option>
              </select>
            </div>
          </div>
          <div class="ib-settings-row">
            <div>
              <span class="ib-settings-label">Target Language</span>
              <select id="ib-inline-lang" class="ib-select">
                ${renderLanguageOptions(settings.targetLanguage)}
              </select>
            </div>
          </div>
        </div>

        ${back}
        ${warningText}
      </div>
      <div class="ib-actions">
        <button class="ib-btn ib-btn-primary ib-apply-btn" data-ib-action="apply" type="button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>
          <span>Apply</span>
        </button>
        <button class="ib-icon-btn ib-copy-btn" data-ib-action="copy" type="button" title="Copy" aria-label="Copy translation">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path></svg>
        </button>
        <button class="ib-icon-btn ${showSettingsPanel ? 'ib-active' : ''}" data-ib-action="settings" title="Quick Settings" aria-label="Quick settings" style="margin-left: auto; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; opacity: 0.75; transition: opacity 0.15s, transform 0.25s;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="${showSettingsPanel ? 'transform: rotate(45deg); opacity: 1; color: var(--ib-accent);' : ''}"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>
    `;

    upgradeInlineSelects(previewEl);

    previewEl.querySelector('[data-ib-action="apply"]')?.addEventListener("click", () => applyPreview("button"));
    previewEl.querySelector('[data-ib-action="copy"]')?.addEventListener("click", () => copyPreview());
    previewEl.querySelector('[data-ib-action="close"]')?.addEventListener("click", () => hidePreview());

    previewEl.querySelector('[data-ib-action="settings"]')?.addEventListener("click", () => {
      previewInteractionUntil = Date.now() + 800;
      showSettingsPanel = !showSettingsPanel;
      renderPreview(preview, compact);
    });

    const handleInlineSettingsChange = async () => {
      const modeVal = previewEl.querySelector('#ib-inline-mode')?.value;
      const toneVal = previewEl.querySelector('#ib-inline-tone')?.value;
      const langVal = previewEl.querySelector('#ib-inline-lang')?.value || '';

      settings.mode = modeVal;
      settings.tone = toneVal;
      settings.targetLanguage = langVal;

      await chrome.storage.sync.set({
        mode: modeVal,
        tone: toneVal,
        targetLanguage: langVal
      });

      const text = activeEl ? getEditableText(activeEl).trim() : "";
      if (shouldProcess(text)) {
        await requestTransform(text, "inline-settings");
      }
    };

    previewEl.querySelector('#ib-inline-mode')?.addEventListener("change", handleInlineSettingsChange);
    previewEl.querySelector('#ib-inline-tone')?.addEventListener("change", handleInlineSettingsChange);
    previewEl.querySelector('#ib-inline-lang')?.addEventListener("change", handleInlineSettingsChange);

    previewEl.style.display = "block";
    positionPreview();
  }

  function upgradeInlineSelects(root) {
    if (!inlineSelectOwners.has(root)) {
      inlineSelectOwners.add(root);

      root.addEventListener("pointerdown", (event) => {
        const target = event.target instanceof Node ? event.target : null;
        root.querySelectorAll(".ib-custom-select.is-open").forEach((wrapper) => {
          if (target && wrapper.contains(target)) return;
          closeInlineSelect(wrapper, { clearSearch: true });
        });
      }, true);

      root.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const openSelects = [...root.querySelectorAll(".ib-custom-select.is-open")];
        if (!openSelects.length) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openSelects.forEach((wrapper, index) => {
          closeInlineSelect(wrapper, { clearSearch: true, focusTrigger: index === 0 });
        });
      }, true);
    }

    root.querySelectorAll("select.ib-select").forEach((select) => {
      select.classList.add("ib-native-select-source");
      select.hidden = true;
      select.tabIndex = -1;
      select.setAttribute("aria-hidden", "true");

      const wrapper = document.createElement("div");
      wrapper.className = "ib-custom-select";
      if (select.classList.contains("ib-selection-toolbar-lang")) {
        wrapper.classList.add("ib-selection-language-dropdown");
      }

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "ib-custom-select-trigger";
      trigger.setAttribute("role", "combobox");
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");

      const value = document.createElement("span");
      value.className = "ib-custom-select-value";

      const chevron = document.createElement("span");
      chevron.className = "ib-custom-select-chevron";
      chevron.setAttribute("aria-hidden", "true");

      const menu = document.createElement("div");
      menu.className = "ib-custom-select-menu";
      menu.setAttribute("role", "listbox");

      const searchable = select.options.length > 24;
      let searchInput = null;
      if (searchable) {
        wrapper.classList.add("is-searchable");
        const searchWrap = document.createElement("div");
        searchWrap.className = "ib-custom-select-search-wrap";
        searchInput = document.createElement("input");
        searchInput.type = "search";
        searchInput.className = "ib-custom-select-search";
        searchInput.placeholder = "Search language...";
        searchInput.setAttribute("aria-label", "Search languages");
        searchInput.addEventListener("pointerdown", (event) => event.stopPropagation());
        searchInput.addEventListener("click", (event) => event.stopPropagation());
        searchWrap.appendChild(searchInput);
        menu.appendChild(searchWrap);
      }

      menu.addEventListener("wheel", (event) => {
        if (!wrapper.classList.contains("is-open")) return;

        let delta = event.deltaY;
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 24;
        else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= Math.max(80, menu.clientHeight);

        const maxScrollTop = Math.max(0, menu.scrollHeight - menu.clientHeight);
        menu.scrollTop = Math.max(0, Math.min(maxScrollTop, menu.scrollTop + delta));
        event.preventDefault();
        event.stopPropagation();
      }, { passive: false });

      const update = () => {
        const selected = select.selectedOptions?.[0];
        value.textContent = selected?.textContent || "";
        menu.querySelectorAll(".ib-custom-select-option").forEach((item) => {
          const isSelected = item.dataset.value === select.value;
          item.classList.toggle("is-selected", isSelected);
          item.setAttribute("aria-selected", String(isSelected));
        });
      };

      for (const option of select.options) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ib-custom-select-option";
        item.dataset.value = option.value;
        item.dataset.search = normalizeLanguageSearch(`${option.textContent} ${option.value}`);
        item.textContent = option.textContent;
        item.setAttribute("role", "option");
        item.addEventListener("click", (event) => {
          previewInteractionUntil = Date.now() + 1200;
          event.preventDefault();
          event.stopPropagation();
          select.value = option.value;
          update();
          closeInlineSelect(wrapper, { clearSearch: true });
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        menu.appendChild(item);
      }

      if (searchInput) {
        searchInput.addEventListener("input", () => {
          filterCustomSelectOptions(menu, searchInput.value);
          menu.scrollTop = 0;
        });
      }

      trigger.append(value, chevron);
      wrapper.append(trigger, menu);
      select.insertAdjacentElement("afterend", wrapper);

      trigger.addEventListener("click", (event) => {
        previewInteractionUntil = Date.now() + 1200;
        event.preventDefault();
        event.stopPropagation();
        const willOpen = !wrapper.classList.contains("is-open");
        root.querySelectorAll(".ib-custom-select.is-open").forEach((other) => {
          if (other !== wrapper) closeInlineSelect(other, { clearSearch: true });
        });
        wrapper.classList.toggle("is-open", willOpen);
        trigger.setAttribute("aria-expanded", String(willOpen));

        if (willOpen) {
          if (searchInput) {
            searchInput.value = "";
            filterCustomSelectOptions(menu, "");
          }
          requestAnimationFrame(() => {
            positionInlineSelectMenu(wrapper, menu, true);
            searchInput?.focus({ preventScroll: true });
            if (root === selectionCardEl) positionSelectionUi();
            else positionPreview();
          });
        } else {
          closeInlineSelect(wrapper, { clearSearch: true });
          window.setTimeout(() => {
            if (root === selectionCardEl) positionSelectionUi();
            else positionPreview();
          }, 0);
        }
      });

      update();
    });
  }

  function closeInlineSelect(wrapper, options = {}) {
    if (!wrapper) return;
    const trigger = wrapper.querySelector(".ib-custom-select-trigger");
    const menu = wrapper.querySelector(".ib-custom-select-menu");
    const searchInput = wrapper.querySelector(".ib-custom-select-search");

    wrapper.classList.remove("is-open", "opens-up");
    trigger?.setAttribute("aria-expanded", "false");
    menu?.style.removeProperty("max-height");
    menu?.style.removeProperty("width");
    menu?.style.removeProperty("left");
    menu?.style.removeProperty("right");

    if (options.clearSearch && searchInput) {
      searchInput.value = "";
      filterCustomSelectOptions(menu, "");
      menu.scrollTop = 0;
    }

    if (options.focusTrigger) {
      trigger?.focus({ preventScroll: true });
    }
  }

  function normalizeLanguageSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .trim();
  }

  function filterCustomSelectOptions(menu, query) {
    const normalized = normalizeLanguageSearch(query);
    menu.querySelectorAll(".ib-custom-select-option").forEach((item) => {
      item.classList.toggle("is-filtered-out", Boolean(normalized) && !item.dataset.search.includes(normalized));
    });
  }

  function positionInlineSelectMenu(wrapper, menu, ensureSelectedVisible = false) {
    if (!wrapper?.classList.contains("is-open") || !menu) return;

    const trigger = wrapper.querySelector(".ib-custom-select-trigger");
    if (!trigger) return;

    wrapper.classList.remove("opens-up");
    menu.style.removeProperty("max-height");
    menu.style.removeProperty("width");
    menu.style.removeProperty("left");
    menu.style.removeProperty("right");

    const rect = trigger.getBoundingClientRect();
    const viewportMargin = 12;
    const menuGap = 6;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - menuGap - viewportMargin);
    const spaceAbove = Math.max(0, rect.top - menuGap - viewportMargin);
    const preferredHeight = Math.min(menu.scrollHeight || 174, 210);
    const shouldOpenUp = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
    const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;

    wrapper.classList.toggle("opens-up", shouldOpenUp);
    menu.style.maxHeight = `${Math.max(72, Math.min(210, Math.floor(availableSpace)))}px`;

    if (wrapper.classList.contains("ib-selection-language-dropdown")) {
      const menuWidth = Math.min(190, Math.max(156, menu.scrollWidth || 156));
      menu.style.width = `${menuWidth}px`;
      const alignRight = rect.left + menuWidth > window.innerWidth - viewportMargin;
      menu.style.left = alignRight ? "auto" : "0";
      menu.style.right = alignRight ? "0" : "auto";
    }

    if (ensureSelectedVisible) {
      const selected = menu.querySelector(".ib-custom-select-option.is-selected");
      requestAnimationFrame(() => selected?.scrollIntoView({ block: "nearest" }));
    }
  }

  function positionOpenInlineMenus() {
    [previewEl, selectionCardEl].forEach((owner) => {
      owner?.querySelectorAll(".ib-custom-select.is-open").forEach((wrapper) => {
        positionInlineSelectMenu(wrapper, wrapper.querySelector(".ib-custom-select-menu"));
      });
    });
  }

  function applyPreview(source) {
    if (!activeEl || !currentPreview?.result || currentPreview.result === "Đang xử lý...") return;
    const before = getEditableText(activeEl);
    const appliedResult = currentPreview.result;
    suppressTransformUntil = Date.now() + 700;
    setEditableText(activeEl, appliedResult);
    clearTimers();
    requestSeq += 1;
    currentPreview = null;
    lastApplied = { el: activeEl, before, after: appliedResult, source };
    clearTimeout(lastAppliedTimer);
    lastAppliedTimer = window.setTimeout(() => { lastApplied = null; }, 8000);
    hidePreview();
    showToast("Đã thay. Ctrl+Z để hoàn tác.");
  }

  async function copyPreview() {
    if (!currentPreview?.result) return;
    await navigator.clipboard.writeText(currentPreview.result).catch(() => {});
    showToast("Đã copy kết quả.");
  }

  function restoreLastApplied() {
    if (!lastApplied?.el) return;
    suppressTransformUntil = Date.now() + 700;
    setEditableText(lastApplied.el, lastApplied.before);
    lastApplied = null;
    hidePreview();
    showToast("Đã hoàn tác InputBridge.");
  }

  function onSelectionPointerDown(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".ib-selection-icon, .ib-selection-card")) {
      selectionInteractionUntil = Date.now() + 1000;
      return;
    }

    clearTimeout(selectionTimer);
    clearTimeout(selectionValidationTimer);
    selectionRequestSeq += 1;
    selectionState = null;
    hideSelectionIcon();
    hideSelectionCard();
  }

  function onSelectionPointerUp(event, root) {
    if (!settings?.enabled || !settings.selectionTranslation) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".ib-selection-icon, .ib-selection-card")) return;

    const pointerPoint = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? { x: event.clientX, y: event.clientY }
      : null;
    const forceTranslate = Boolean(settings.selectionShiftTranslate && event.shiftKey);
    const pointerType = String(event.pointerType || "mouse");

    window.setTimeout(() => handleSelectionCandidate(root, target, {
      forceTranslate,
      pointerPoint,
      pointerType
    }), 0);
  }

  function onSelectionKeyUp(event, root) {
    if (!settings?.enabled || !settings.selectionTranslation) return;
    const key = String(event.key || "");
    const shiftShortcut = Boolean(settings.selectionShiftTranslate && key === "Shift");
    const selectionKey = shiftShortcut ||
      event.shiftKey ||
      key.startsWith("Arrow") ||
      key === "Home" ||
      key === "End" ||
      ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "a");
    if (!selectionKey) return;

    window.setTimeout(() => handleSelectionCandidate(root, event.target, {
      forceTranslate: shiftShortcut,
      keyboard: true,
      deferIcon: Boolean(settings.selectionShiftTranslate && event.shiftKey && key !== "Shift")
    }), 0);
  }

  function onSelectionChange(root) {
    if (!selectionState || selectionCardEl?.style.display === "block") return;
    clearTimeout(selectionValidationTimer);
    selectionValidationTimer = window.setTimeout(() => {
      if (Date.now() < selectionInteractionUntil) return;
      const next = getSelectionSnapshot(root, null);
      if (!next || next.text !== selectionState.text) {
        selectionState = null;
        hideSelectionIcon();
        return;
      }
      selectionState = { ...selectionState, ...next };
      positionSelectionUi();
    }, 40);
  }

  function handleSelectionCandidate(root, target, options = {}) {
    const snapshot = getSelectionSnapshot(root, target);
    if (!snapshot) {
      if (selectionCardEl?.style.display !== "block") {
        selectionState = null;
        hideSelectionIcon();
      }
      return;
    }

    selectionState = {
      ...snapshot,
      pointerPoint: options.pointerPoint || null,
      pointerType: options.pointerType || "keyboard"
    };
    selectionRequestSeq += 1;
    selectionSettingsOpen = false;
    selectionExplanation = "";
    selectionExplanationLoading = false;
    selectionExplanationError = "";
    selectionIsFavorite = false;
    selectionCardPlacement = "";
    if (selectionCardEl) delete selectionCardEl.dataset.placement;
    clearTimeout(selectionTimer);
    hideSelectionCard();
    hideSelectionIcon();

    if (options.forceTranslate) {
      selectionTimer = window.setTimeout(() => {
        if (selectionState?.text === snapshot.text) void translateSelectedText();
      }, 70);
      return;
    }

    if (settings.selectionTrigger === "instant") {
      selectionTimer = window.setTimeout(() => {
        if (selectionState?.text === snapshot.text) void translateSelectedText();
      }, 280);
      return;
    }

    const iconDelay = options.deferIcon
      ? 180
      : options.pointerType === "touch"
        ? 100
        : 10;
    selectionTimer = window.setTimeout(() => {
      if (selectionState?.text !== snapshot.text) return;
      if (selectionCardEl?.style.display === "block") return;
      showSelectionIcon();
    }, iconDelay);
  }

  function getSelectionSnapshot(root, target) {
    if (!settings?.enabled || !settings.selectionTranslation) return null;
    const targetEl = target instanceof Element ? target : null;
    if (targetEl?.closest(".ib-preview-card, .ib-toast, .ib-selection-icon, .ib-selection-card")) return null;

    const editable = findEditable(targetEl);
    if (editable && !settings.selectionAllowEditable) return null;

    const tag = editable?.tagName?.toLowerCase();
    if (editable && (tag === "input" || tag === "textarea")) {
      const start = Number(editable.selectionStart ?? 0);
      const end = Number(editable.selectionEnd ?? 0);
      if (end <= start) return null;
      const text = normalizeSelectionText((editable.value || "").slice(start, end));
      if (!isSelectionTextValid(text)) return null;
      const rect = editable.getBoundingClientRect();
      if (!rect.width && !rect.height) return null;
      const editableRect = copyRect(rect);
      return {
        text,
        root,
        sourceEl: editable,
        range: null,
        anchorRect: editableRect,
        selectionBounds: editableRect,
        selectionRects: [editableRect],
        isEditable: true
      };
    }

    const selection = getSelectionForRoot(root);
    if (!selection || selection.isCollapsed || selection.rangeCount < 1) return null;
    const text = normalizeSelectionText(selection.toString());
    if (!isSelectionTextValid(text)) return null;

    const range = selection.getRangeAt(0).cloneRange();
    const common = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer?.parentElement;
    if (common?.closest?.(".ib-preview-card, .ib-toast, .ib-selection-icon, .ib-selection-card")) return null;
    const rangeEditable = findEditable(common);
    if (rangeEditable && !settings.selectionAllowEditable) return null;

    const geometry = getSelectionGeometry(range);
    if (!geometry) return null;
    return {
      text,
      root,
      sourceEl: rangeEditable || common || null,
      range,
      ...geometry,
      isEditable: Boolean(rangeEditable)
    };
  }

  function getSelectionForRoot(root) {
    try {
      if (root instanceof ShadowRoot && typeof root.getSelection === "function") {
        const shadowSelection = root.getSelection();
        if (shadowSelection?.rangeCount) return shadowSelection;
      }
    } catch {}
    return window.getSelection?.() || document.getSelection?.() || null;
  }

  function getSelectionGeometry(range) {
    try {
      let rects = Array.from(range.getClientRects())
        .filter((rect) => rect.width || rect.height)
        .map(copyRect);

      if (!rects.length) {
        const fallback = range.getBoundingClientRect();
        if (fallback?.width || fallback?.height) rects = [copyRect(fallback)];
      }
      if (!rects.length) return null;

      const bounds = rects.reduce((acc, rect) => ({
        left: Math.min(acc.left, rect.left),
        top: Math.min(acc.top, rect.top),
        right: Math.max(acc.right, rect.right),
        bottom: Math.max(acc.bottom, rect.bottom),
        width: 0,
        height: 0
      }), {
        left: rects[0].left,
        top: rects[0].top,
        right: rects[0].right,
        bottom: rects[0].bottom,
        width: 0,
        height: 0
      });
      bounds.width = Math.max(0, bounds.right - bounds.left);
      bounds.height = Math.max(0, bounds.bottom - bounds.top);

      return {
        anchorRect: rects.at(-1),
        selectionBounds: bounds,
        selectionRects: rects
      };
    } catch {
      return null;
    }
  }

  function getSelectionRangeRect(range) {
    return getSelectionGeometry(range)?.anchorRect || null;
  }

  function copyRect(rect) {
    return {
      left: Number(rect.left || 0),
      top: Number(rect.top || 0),
      right: Number(rect.right || 0),
      bottom: Number(rect.bottom || 0),
      width: Number(rect.width || 0),
      height: Number(rect.height || 0)
    };
  }

  function normalizeSelectionText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isSelectionTextValid(text) {
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return false;
    const min = Math.max(1, Number(settings.selectionMinChars || 2));
    const max = Math.max(min, Number(settings.selectionMaxChars || 1000));
    return text.length >= min && text.length <= max;
  }

  function showSelectionIcon() {
    if (!selectionState) return;
    if (!selectionIconEl) {
      selectionIconEl = document.createElement("button");
      selectionIconEl.type = "button";
      selectionIconEl.className = "ib-selection-icon";
      selectionIconEl.setAttribute("aria-label", "Translate selected text");
      selectionIconEl.innerHTML = `<span aria-hidden="true">A文</span>`;
      selectionIconEl.addEventListener("pointerdown", (event) => {
        selectionInteractionUntil = Date.now() + 1000;
        event.preventDefault();
        event.stopPropagation();
      });
      selectionIconEl.addEventListener("click", (event) => {
        selectionInteractionUntil = Date.now() + 1000;
        event.preventDefault();
        event.stopPropagation();
        void translateSelectedText();
      });
      document.documentElement.appendChild(selectionIconEl);
    }
    const shortcutHint = settings.selectionShiftTranslate ? "Click to translate · Hold Shift for instant" : "Click to translate";
    selectionIconEl.title = shortcutHint;
    selectionIconEl.dataset.hint = shortcutHint;
    selectionIconEl.style.display = "flex";
    positionSelectionUi();
  }

  async function translateSelectedText() {
    const state = selectionState;
    if (!state?.text) return;

    clearTimeout(selectionTimer);
    hideSelectionIcon();
    const seq = ++selectionRequestSeq;
    renderSelectionCard({ loading: true });

    const response = await sendMessage({
      type: "IB_TRANSLATE_SELECTION",
      text: state.text,
      targetLanguage: settings.targetLanguage,
      fallbackLanguage: settings.backTranslationLanguage || "Vietnamese",
      origin: getPageOrigin(),
      contextHint: getContextHint()
    });

    if (seq !== selectionRequestSeq || selectionState !== state) return;
    if (!response?.ok) {
      renderSelectionCard({ error: response?.error || "Translation failed." });
      return;
    }

    const result = String(response.data?.result || "").trim();
    selectionState = {
      ...state,
      result,
      targetLanguage: response.data?.targetLanguage || settings.targetLanguage,
      detectedSourceLanguage: response.data?.detectedSourceLanguage || "",
      detectedSourceCode: response.data?.detectedSourceCode || "",
      dictionaryMode: Boolean(response.data?.dictionaryMode),
      dictionary: Array.isArray(response.data?.dictionary) ? response.data.dictionary : [],
      phonetic: String(response.data?.phonetic || "").trim(),
      headword: String(response.data?.headword || state.text || "").trim()
    };
    renderSelectionCard({ result });
  }

  function renderSelectionCard({ loading = false, result = "", error = "" } = {}) {
    if (!selectionState) return;
    if (!selectionCardEl) {
      selectionCardEl = document.createElement("div");
      selectionCardEl.className = "ib-selection-card";
      selectionCardEl.addEventListener("pointerdown", (event) => {
        selectionInteractionUntil = Date.now() + 1400;
        event.stopPropagation();
        if (event.target instanceof Element && event.target.closest("button")) event.preventDefault();
      });
      document.documentElement.appendChild(selectionCardEl);
    }

    const displayResult = error || result || selectionState.result || "";
    const resultLength = displayResult.length;
    const themeClass = settings.selectionCardTheme === "dark" ? "ib-selection-dark" : "";
    const dictionaryMode = !loading && !error && Boolean(selectionState.dictionaryMode) && Array.isArray(selectionState.dictionary) && selectionState.dictionary.length > 0;
    const expanded = selectionSettingsOpen || selectionExplanation || selectionExplanationLoading || selectionExplanationError;
    const sizeClass = expanded
      ? "ib-selection-expanded"
      : dictionaryMode
        ? "ib-selection-dictionary"
        : resultLength <= 56
          ? "ib-selection-micro"
          : resultLength <= 190
            ? "ib-selection-compact"
            : "";
    const explanationMarkup = selectionExplanationLoading
      ? `<div class="ib-selection-explanation is-loading"><span class="ib-selection-loading"><i></i><i></i><i></i></span></div>`
      : selectionExplanationError
        ? `<div class="ib-selection-explanation is-error">${escapeHtml(selectionExplanationError)}</div>`
        : selectionExplanation
          ? `<div class="ib-selection-explanation"><span>AI explanation</span>${escapeHtml(selectionExplanation)}</div>`
          : "";
    const settingsMarkup = selectionSettingsOpen
      ? `<div class="ib-selection-settings">
          <label><span>Translate to</span><select id="ib-selection-lang" class="ib-select">${renderLanguageOptions(selectionState.targetLanguage || settings.targetLanguage)}</select></label>
          <label><span>Trigger</span><select id="ib-selection-trigger" class="ib-select">
            <option value="icon" ${settings.selectionTrigger === "icon" ? "selected" : ""}>Click icon</option>
            <option value="instant" ${settings.selectionTrigger === "instant" ? "selected" : ""}>Instant</option>
          </select></label>
          <label class="ib-selection-check"><input id="ib-selection-shift" type="checkbox" ${settings.selectionShiftTranslate ? "checked" : ""}> Hold Shift to translate immediately</label>
          <label class="ib-selection-check"><input id="ib-selection-editable" type="checkbox" ${settings.selectionAllowEditable ? "checked" : ""}> Allow inside editable fields</label>
          <div class="ib-selection-settings-actions">
            <button type="button" data-ib-selection-action="favorite" class="${selectionIsFavorite ? "is-active" : ""}">
              <svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>
              ${selectionIsFavorite ? "Saved" : "Save"}
            </button>
            <button type="button" data-ib-selection-action="theme">
              <svg viewBox="0 0 24 24"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"></path></svg>
              ${settings.selectionCardTheme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
        </div>`
      : "";

    const dictionaryMarkup = dictionaryMode ? renderSelectionDictionary(displayResult) : "";

    selectionCardEl.className = `ib-selection-card ${sizeClass} ${themeClass}`.trim();
    selectionCardEl.innerHTML = `
      <div class="ib-selection-toolbar">
        <select id="ib-selection-toolbar-lang" class="ib-select ib-selection-toolbar-lang" aria-label="Translate to language">
          ${renderLanguageOptions(selectionState.targetLanguage || settings.targetLanguage || "English")}
        </select>
        <div class="ib-selection-tools">
          <button type="button" data-ib-selection-action="speak" title="Listen" aria-label="Listen to translation">
            <svg viewBox="0 0 24 24"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"></path><path d="M15 9.5a4 4 0 0 1 0 5M17.8 7a7.5 7.5 0 0 1 0 10"></path></svg>
          </button>
          <button type="button" data-ib-selection-action="ai" class="${selectionExplanation || selectionExplanationLoading ? "is-active" : ""}" title="Explain with AI" aria-label="Explain with AI">
            <svg viewBox="0 0 24 24"><path d="m12 3 1.2 4.1L17 8.5l-3.8 1.4L12 14l-1.2-4.1L7 8.5l3.8-1.4L12 3Z"></path><path d="m18.5 14 .7 2.3 2.3.7-2.3.8-.7 2.2-.8-2.2-2.2-.8 2.2-.7.8-2.3Z"></path></svg>
          </button>
          <button class="ib-selection-copy" type="button" data-ib-selection-action="copy" title="Copy translation" aria-label="Copy translation" ${loading || error || !displayResult ? "disabled" : ""}>
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button type="button" data-ib-selection-action="settings" class="${selectionSettingsOpen ? "is-active" : ""}" title="Quick settings" aria-label="Quick settings">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"></path></svg>
          </button>
          <button class="ib-selection-close" type="button" data-ib-selection-action="close" title="Close" aria-label="Close translation">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg>
          </button>
        </div>
      </div>
      <div class="ib-selection-body">
        ${dictionaryMode
          ? dictionaryMarkup
          : `<div class="ib-selection-result ${error ? "is-error" : ""}">${loading
              ? `<span class="ib-selection-loading"><i></i><i></i><i></i></span>`
              : escapeHtml(displayResult || "No translation returned.")}</div>`}
        ${explanationMarkup}
        ${settingsMarkup}
      </div>
    `;

    upgradeInlineSelects(selectionCardEl);
    bindSelectionCardActions({ loading, error, result: displayResult });
    selectionCardEl.style.display = "block";
    positionSelectionUi({ preserveCardPlacement: true });
    if (!loading && !error && displayResult) void refreshSelectionFavoriteState();
  }

  function renderSelectionDictionary(primaryMeaning) {
    const phonetic = String(selectionState?.phonetic || "").trim();
    const groups = Array.isArray(selectionState?.dictionary) ? selectionState.dictionary : [];
    const targetLanguage = selectionState?.targetLanguage || settings.targetLanguage || "English";
    const groupMarkup = groups.map((group) => {
      const meanings = Array.isArray(group?.meanings)
        ? [...new Set(group.meanings.map((meaning) => String(meaning || "").trim()).filter(Boolean))].slice(0, 8)
        : [];
      if (!meanings.length) return "";
      return `<section class="ib-dictionary-group">
        <div class="ib-dictionary-pos">${escapeHtml(dictionaryPartOfSpeechLabel(group?.partOfSpeech, targetLanguage))}</div>
        <div class="ib-dictionary-meanings">${meanings.map(escapeHtml).join(", ")}</div>
      </section>`;
    }).join("");

    return `<div class="ib-dictionary-view">
      <div class="ib-dictionary-summary">
        ${phonetic ? `<div class="ib-dictionary-phonetic">/${escapeHtml(phonetic.replace(/^\/+|\/+$/g, ""))}/</div>` : ""}
        <div class="ib-dictionary-primary">${escapeHtml(primaryMeaning || "No translation returned.")}</div>
      </div>
      <div class="ib-dictionary-groups">${groupMarkup}</div>
    </div>`;
  }

  function dictionaryPartOfSpeechLabel(partOfSpeech, targetLanguage) {
    const raw = String(partOfSpeech || "other").trim();
    const key = raw.toLowerCase();
    if (String(targetLanguage || "").toLowerCase().includes("vietnam")) {
      const vi = {
        adjective: "Tính từ",
        adverb: "Trạng từ",
        noun: "Danh từ",
        verb: "Động từ",
        pronoun: "Đại từ",
        preposition: "Giới từ",
        conjunction: "Liên từ",
        interjection: "Thán từ",
        determiner: "Từ hạn định",
        article: "Mạo từ",
        other: "Nghĩa khác"
      };
      return vi[key] || raw;
    }
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Other";
  }

  function bindSelectionCardActions({ loading, error, result }) {
    selectionCardEl.querySelector('[data-ib-selection-action="close"]')?.addEventListener("click", () => hideSelectionUi());
    selectionCardEl.querySelectorAll('[data-ib-selection-action="copy"]').forEach((button) => button.addEventListener("click", async () => {
      const text = selectionState?.result || result;
      if (!text) return;
      await navigator.clipboard.writeText(text).catch(() => {});
      showToast("Đã copy bản dịch.");
    }));
    selectionCardEl.querySelector('[data-ib-selection-action="speak"]')?.addEventListener("click", speakSelectionTranslation);
    selectionCardEl.querySelectorAll('[data-ib-selection-action="ai"]').forEach((button) => button.addEventListener("click", toggleSelectionExplanation));
    selectionCardEl.querySelector('[data-ib-selection-action="favorite"]')?.addEventListener("click", () => void toggleSelectionFavorite());
    selectionCardEl.querySelector('[data-ib-selection-action="theme"]')?.addEventListener("click", () => {
      settings.selectionCardTheme = settings.selectionCardTheme === "dark" ? "light" : "dark";
      chrome.storage.sync.set({ selectionCardTheme: settings.selectionCardTheme }).catch(() => {});
      renderSelectionCard({ loading, error, result });
    });
    selectionCardEl.querySelectorAll('[data-ib-selection-action="settings"]').forEach((button) => button.addEventListener("click", () => {
      selectionSettingsOpen = !selectionSettingsOpen;
      renderSelectionCard({ loading, error, result });
    }));

    const languageSelects = selectionCardEl.querySelectorAll('#ib-selection-lang, #ib-selection-toolbar-lang');
    const triggerSelect = selectionCardEl.querySelector('#ib-selection-trigger');
    const shiftCheck = selectionCardEl.querySelector('#ib-selection-shift');
    const editableCheck = selectionCardEl.querySelector('#ib-selection-editable');
    languageSelects.forEach((languageSelect) => languageSelect.addEventListener("change", async () => {
      const nextLanguage = languageSelect.value || settings.targetLanguage;
      settings.targetLanguage = nextLanguage;
      if (selectionState) selectionState.targetLanguage = nextLanguage;
      await chrome.storage.sync.set({ targetLanguage: nextLanguage }).catch(() => {});
      void translateSelectedText();
    }));
    triggerSelect?.addEventListener("change", () => {
      settings.selectionTrigger = triggerSelect.value;
      chrome.storage.sync.set({ selectionTrigger: settings.selectionTrigger }).catch(() => {});
    });
    shiftCheck?.addEventListener("change", () => {
      settings.selectionShiftTranslate = shiftCheck.checked;
      chrome.storage.sync.set({ selectionShiftTranslate: settings.selectionShiftTranslate }).catch(() => {});
    });
    editableCheck?.addEventListener("change", () => {
      settings.selectionAllowEditable = editableCheck.checked;
      chrome.storage.sync.set({ selectionAllowEditable: settings.selectionAllowEditable }).catch(() => {});
    });
  }

  function speakSelectionTranslation() {
    const dictionaryMode = Boolean(selectionState?.dictionaryMode);
    const text = dictionaryMode ? selectionState?.text : selectionState?.result;
    if (!text || !("speechSynthesis" in window)) {
      showToast("Trình duyệt này không hỗ trợ đọc văn bản.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const speechLanguage = dictionaryMode
      ? selectionState?.detectedSourceLanguage || selectionState?.detectedSourceCode
      : selectionState?.targetLanguage || settings.targetLanguage;
    utterance.lang = selectionSpeechLanguage(speechLanguage);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  function selectionSpeechLanguage(language) {
    const code = LANGUAGE_CATALOG?.codeFor(language, "en") || "en";
    const regionalDefaults = {
      en: "en-US",
      vi: "vi-VN",
      ja: "ja-JP",
      ko: "ko-KR",
      fr: "fr-FR",
      de: "de-DE",
      es: "es-ES",
      pt: "pt-BR",
      ar: "ar-SA",
      hi: "hi-IN",
      zh: "zh-CN"
    };
    return regionalDefaults[String(code).toLowerCase()] || code;
  }

  function toggleSelectionExplanation() {
    if (selectionExplanationLoading) return;
    if (selectionExplanation || selectionExplanationError) {
      selectionExplanation = "";
      selectionExplanationError = "";
      renderSelectionCard({ result: selectionState?.result || "" });
      return;
    }
    void explainSelectionWithAi();
  }

  async function explainSelectionWithAi() {
    if (!selectionState?.text || selectionExplanationLoading) return;
    selectionExplanationLoading = true;
    selectionExplanationError = "";
    renderSelectionCard({ result: selectionState.result || "" });
    const state = selectionState;
    const response = await sendMessage({
      type: "IB_EXPLAIN_SELECTION",
      text: state.text,
      translation: state.result || "",
      explainLanguage: settings.backTranslationLanguage || "Vietnamese",
      origin: getPageOrigin(),
      contextHint: getContextHint()
    });
    if (selectionState !== state) return;
    selectionExplanationLoading = false;
    if (!response?.ok) {
      selectionExplanationError = response?.error || "AI explanation failed.";
    } else {
      selectionExplanation = String(response.data?.result || "").trim();
      selectionExplanationError = "";
    }
    renderSelectionCard({ result: state.result || "" });
  }

  function selectionFavoriteKey() {
    return `${selectionState?.text || ""}\u0000${selectionState?.targetLanguage || settings.targetLanguage || "English"}`;
  }

  async function refreshSelectionFavoriteState() {
    if (!chrome.storage?.local || !selectionState) return;
    const state = selectionState;
    const key = selectionFavoriteKey();
    const stored = await chrome.storage.local.get("selectionFavorites").catch(() => ({}));
    if (selectionState !== state) return;
    const favorites = Array.isArray(stored.selectionFavorites) ? stored.selectionFavorites : [];
    const next = favorites.some((item) => item?.key === key);
    if (next !== selectionIsFavorite) {
      selectionIsFavorite = next;
      renderSelectionCard({ result: state.result || "" });
    }
  }

  async function toggleSelectionFavorite() {
    if (!chrome.storage?.local || !selectionState?.result) return;
    const key = selectionFavoriteKey();
    const stored = await chrome.storage.local.get("selectionFavorites").catch(() => ({}));
    let favorites = Array.isArray(stored.selectionFavorites) ? stored.selectionFavorites : [];
    if (favorites.some((item) => item?.key === key)) {
      favorites = favorites.filter((item) => item?.key !== key);
      selectionIsFavorite = false;
      showToast("Đã bỏ khỏi mục đã lưu.");
    } else {
      favorites = [{ key, source: selectionState.text, result: selectionState.result, language: selectionState.targetLanguage, savedAt: Date.now() }, ...favorites].slice(0, 100);
      selectionIsFavorite = true;
      showToast("Đã lưu bản dịch.");
    }
    await chrome.storage.local.set({ selectionFavorites: favorites }).catch(() => {});
    renderSelectionCard({ result: selectionState.result || "" });
  }

  function refreshSelectionRect() {
    if (!selectionState) return null;
    if (selectionState.range) {
      const geometry = getSelectionGeometry(selectionState.range);
      if (geometry) Object.assign(selectionState, geometry);
    } else if (selectionState.sourceEl?.isConnected) {
      const sourceRect = copyRect(selectionState.sourceEl.getBoundingClientRect());
      selectionState.anchorRect = sourceRect;
      selectionState.selectionBounds = sourceRect;
      selectionState.selectionRects = [sourceRect];
    }
    return selectionState.selectionBounds || selectionState.anchorRect || null;
  }

  function positionSelectionUi(options = {}) {
    if (!selectionState) return;
    const bounds = refreshSelectionRect();
    if (!bounds) return;

    const anchor = selectionState.anchorRect || bounds;
    const obstacles = Array.isArray(selectionState.selectionRects) && selectionState.selectionRects.length
      ? selectionState.selectionRects
      : [bounds];
    const outsideViewport = bounds.bottom < -24 || bounds.top > window.innerHeight + 24 || bounds.right < -24 || bounds.left > window.innerWidth + 24;
    if (outsideViewport) {
      hideSelectionUi();
      return;
    }

    const point = selectionState.pointerPoint &&
      Number.isFinite(selectionState.pointerPoint.x) &&
      Number.isFinite(selectionState.pointerPoint.y)
      ? selectionState.pointerPoint
      : { x: anchor.right, y: anchor.bottom };

    if (selectionIconEl?.style.display === "flex") {
      const width = selectionIconEl.offsetWidth || 30;
      const height = selectionIconEl.offsetHeight || 30;
      const gap = 8;
      const candidates = [
        { placement: "pointer-bottom-right", left: point.x + gap, top: point.y + gap },
        { placement: "pointer-bottom-left", left: point.x - width - gap, top: point.y + gap },
        { placement: "pointer-top-right", left: point.x + gap, top: point.y - height - gap },
        { placement: "pointer-top-left", left: point.x - width - gap, top: point.y - height - gap },
        { placement: "selection-right", left: anchor.right + gap, top: anchor.top + (anchor.height - height) / 2 },
        { placement: "selection-left", left: anchor.left - width - gap, top: anchor.top + (anchor.height - height) / 2 },
        { placement: "selection-bottom", left: anchor.right - width, top: anchor.bottom + gap },
        { placement: "selection-top", left: anchor.right - width, top: anchor.top - height - gap }
      ];
      const chosen = chooseOverlayCandidate(candidates, width, height, {
        margin: 10,
        obstacles,
        pointer: point,
        obstaclePadding: 4,
        pointerPadding: 5
      });

      selectionIconEl.classList.toggle("ib-tooltip-left", chosen.left > window.innerWidth / 2);
      selectionIconEl.dataset.placement = chosen.placement;
      selectionIconEl.style.left = `${chosen.left}px`;
      selectionIconEl.style.top = `${chosen.top}px`;
    }

    if (selectionCardEl?.style.display === "block") {
      const width = Math.min(selectionCardEl.offsetWidth || 320, window.innerWidth - 24);
      const height = Math.min(selectionCardEl.offsetHeight || 150, window.innerHeight - 24);
      const gap = 10;
      const centerLeft = bounds.left + (bounds.width - width) / 2;
      const rightAligned = bounds.right - width;
      const verticalCenter = bounds.top + (bounds.height - height) / 2;
      const pointerLeft = point.x - Math.min(width - 24, width * 0.78);
      const candidates = [
        { placement: "bottom-start", left: bounds.left, top: bounds.bottom + gap },
        { placement: "bottom-center", left: centerLeft, top: bounds.bottom + gap },
        { placement: "bottom-end", left: rightAligned, top: bounds.bottom + gap },
        { placement: "top-start", left: bounds.left, top: bounds.top - height - gap },
        { placement: "top-center", left: centerLeft, top: bounds.top - height - gap },
        { placement: "top-end", left: rightAligned, top: bounds.top - height - gap },
        { placement: "right", left: bounds.right + gap, top: verticalCenter },
        { placement: "left", left: bounds.left - width - gap, top: verticalCenter },
        { placement: "pointer-bottom", left: pointerLeft, top: point.y + 14 },
        { placement: "pointer-top", left: pointerLeft, top: point.y - height - 14 }
      ];
      const chosen = chooseOverlayCandidate(candidates, width, height, {
        margin: 12,
        obstacles,
        pointer: point,
        obstaclePadding: 7,
        pointerPadding: 12,
        distanceWeight: 0.018,
        preferredPlacement: options.preserveCardPlacement
          ? selectionCardPlacement || selectionCardEl.dataset.placement || ""
          : ""
      });

      selectionCardPlacement = chosen.placement;
      selectionCardEl.dataset.placement = chosen.placement;
      selectionCardEl.style.left = `${chosen.left}px`;
      selectionCardEl.style.top = `${chosen.top}px`;
    }
  }

  function chooseOverlayCandidate(candidates, width, height, options = {}) {
    const margin = Number(options.margin || 10);
    const obstacles = Array.isArray(options.obstacles) ? options.obstacles : [];
    const pointer = options.pointer || null;
    const obstaclePadding = Number(options.obstaclePadding || 0);
    const pointerPadding = Number(options.pointerPadding || 0);
    const distanceWeight = Number(options.distanceWeight || 0.025);
    const preferredPlacement = String(options.preferredPlacement || "");
    const viewportRight = Math.max(margin, window.innerWidth - width - margin);
    const viewportBottom = Math.max(margin, window.innerHeight - height - margin);

    const scored = candidates.map((candidate, index) => {
      const rawLeft = Number(candidate.left || 0);
      const rawTop = Number(candidate.top || 0);
      const left = Math.min(viewportRight, Math.max(margin, rawLeft));
      const top = Math.min(viewportBottom, Math.max(margin, rawTop));
      const box = { left, top, right: left + width, bottom: top + height, width, height };
      const overflow = Math.abs(left - rawLeft) + Math.abs(top - rawTop);
      let score = index * 6 + overflow * 180;
      if (preferredPlacement && candidate.placement === preferredPlacement) score -= 500;

      for (const obstacle of obstacles) {
        score += overlapArea(box, inflateRect(obstacle, obstaclePadding)) * 120;
      }

      if (pointer) {
        const pointerZone = {
          left: pointer.x - pointerPadding,
          top: pointer.y - pointerPadding,
          right: pointer.x + pointerPadding,
          bottom: pointer.y + pointerPadding,
          width: pointerPadding * 2,
          height: pointerPadding * 2
        };
        score += overlapArea(box, pointerZone) * 260;
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        score += Math.hypot(centerX - pointer.x, centerY - pointer.y) * distanceWeight;
      }

      return { ...candidate, left, top, score };
    });

    scored.sort((first, second) => first.score - second.score);
    return scored[0] || { placement: "fallback", left: margin, top: margin };
  }

  function inflateRect(rect, padding) {
    return {
      left: rect.left - padding,
      top: rect.top - padding,
      right: rect.right + padding,
      bottom: rect.bottom + padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2
    };
  }

  function overlapArea(first, second) {
    const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    return width * height;
  }

  function hideSelectionIcon() {
    if (selectionIconEl) selectionIconEl.style.display = "none";
  }

  function hideSelectionCard() {
    if (selectionCardEl) selectionCardEl.style.display = "none";
  }

  function hideSelectionUi() {
    clearTimeout(selectionTimer);
    clearTimeout(selectionValidationTimer);
    selectionRequestSeq += 1;
    selectionState = null;
    selectionSettingsOpen = false;
    selectionExplanation = "";
    selectionExplanationLoading = false;
    selectionExplanationError = "";
    selectionIsFavorite = false;
    selectionCardPlacement = "";
    if (selectionCardEl) delete selectionCardEl.dataset.placement;
    window.speechSynthesis?.cancel?.();
    hideSelectionIcon();
    hideSelectionCard();
  }

  function hidePreview() {
    if (previewEl) {
      previewEl.style.display = "none";
      previewEl.classList.remove("ib-typing-card");
    }
  }

  function clearTimers() {
    clearTimeout(debounceTimer);
    clearTimeout(typingDelayTimer);
    clearTimeout(autoReplaceTimer);
  }

  function onViewportScroll(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.(".ib-selection-card")) return;

    clearTimeout(selectionTimer);
    if (selectionIconEl?.style.display === "flex") {
      hideSelectionIcon();
      if (selectionCardEl?.style.display !== "block") selectionState = null;
    }
    repositionAll();
  }

  function repositionAll() {
    if (activeEl && previewEl?.style.display !== "none") {
      positionPreview();
      positionOpenInlineMenus();
    }
    positionSelectionUi();
  }

  function positionPreview() {
    const rect = getElementRect(activeEl);
    if (!rect || !previewEl) return;
    const margin = 8;
    const width = Math.min(previewEl.offsetWidth || 372, window.innerWidth - 24);
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left));
    let top = rect.bottom + margin;
    const estimatedHeight = Math.min(360, previewEl.offsetHeight || 180);
    if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, rect.top - estimatedHeight - margin);
    previewEl.style.left = `${left}px`;
    previewEl.style.top = `${top}px`;
  }

  function getElementRect(el) {
    if (!el?.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width || rect.height) return rect;
    return null;
  }

  function shouldProcess(text) {
    if (!settings?.enabled) return false;
    if (!text) return false;
    if (text.length < Number(settings.minChars || 1)) return false;
    // \w/\W trong JavaScript chủ yếu theo ASCII, nên chữ Việt có dấu bị loại nhầm.
    // Chỉ bỏ qua text không chứa bất kỳ chữ cái hoặc chữ số Unicode nào.
    if (!/[\p{L}\p{N}]/u.test(text)) return false;
    return true;
  }

  function findEditable(node) {
    let el = node instanceof Element ? node : node?.parentElement;

    while (el) {
      const resolved = resolveEditable(el);
      if (resolved) return resolved;

      if (el.parentElement) {
        el = el.parentElement;
        continue;
      }

      const root = el.getRootNode?.();
      el = root instanceof ShadowRoot ? root.host : null;
    }

    return null;
  }

  function resolveEditable(el) {
    if (!(el instanceof HTMLElement)) return null;
    if (el.closest?.('[data-inputbridge-ignore="true"], .ib-preview-card, .ib-floating-icon')) return null;
    if (el.getAttribute("aria-disabled") === "true" || el.getAttribute("aria-readonly") === "true") return null;

    const tag = el.tagName?.toLowerCase();
    if (tag === "textarea") return !el.disabled && !el.readOnly ? el : null;
    if (tag === "input") {
      const type = String(el.getAttribute("type") || "text").toLowerCase();
      return !el.disabled && !el.readOnly && !SKIP_INPUT_TYPES.has(type) ? el : null;
    }

    if (el.isContentEditable) {
      let host = el;
      while (host.parentElement?.isContentEditable) host = host.parentElement;
      return host;
    }

    const role = String(el.getAttribute("role") || "").toLowerCase();
    const ariaMultiline = el.getAttribute("aria-multiline") === "true";
    const frameworkEditor = el.matches?.('[data-lexical-editor="true"], .ProseMirror, .ql-editor, [data-slate-editor="true"]');
    if ((role === "textbox" || ariaMultiline || frameworkEditor) && !el.hasAttribute("disabled")) return el;

    return null;
  }

  function isEditable(el) {
    return Boolean(resolveEditable(el));
  }

  function getEditorKind(el) {
    if (!el) return "unknown";
    const tag = el.tagName?.toLowerCase();
    if (tag === "textarea" || tag === "input") return "native";
    if (!el.isContentEditable && typeof el.value === "string") return "value";
    if (el.isContentEditable || el.getAttribute("role") === "textbox" || el.getAttribute("aria-multiline") === "true") return "rich";
    return "unknown";
  }

  function getEditableText(el) {
    if (!el) return "";
    const kind = getEditorKind(el);
    if (kind === "native" || kind === "value") return String(el.value || "");
    if (kind === "rich") return el.innerText || el.textContent || "";
    return "";
  }

  function normalizeEditableText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function findPropertyDescriptor(target, property) {
    let proto = target;
    while (proto) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, property);
      if (descriptor) return descriptor;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function dispatchEditorInput(el, value) {
    try {
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertReplacementText",
        data: value
      }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }

  function setEditableText(el, value) {
    if (!el) return;
    suppressNextInput = true;
    el.focus();

    const kind = getEditorKind(el);
    if (kind === "native" || kind === "value") {
      const descriptor = findPropertyDescriptor(el, "value");
      if (descriptor?.set) descriptor.set.call(el, value);
      else el.value = value;

      dispatchEditorInput(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      if (typeof el.setSelectionRange === "function") {
        try { el.setSelectionRange(value.length, value.length); } catch {}
      }
      return;
    }

    if (kind === "rich") {
      try {
        el.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          composed: true,
          cancelable: true,
          inputType: "insertReplacementText",
          data: value
        }));
      } catch {}

      const selection = el.ownerDocument?.getSelection?.() || window.getSelection();
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);

      let inserted = false;
      try { inserted = Boolean(el.ownerDocument.execCommand("insertText", false, value)); } catch {}

      if (!inserted) {
        range.deleteContents();
        const textNode = el.ownerDocument.createTextNode(value);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }

      dispatchEditorInput(el, value);
    }
  }

  function isLikelySendControl(control, editable) {
    if (!(control instanceof HTMLElement) || !isVisibleAndEnabled(control)) return false;

    const meta = [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.getAttribute("data-testid"),
      control.getAttribute("name"),
      control.textContent
    ].filter(Boolean).join(" ");

    if (/send|gửi|submit|paper.?plane|send-button|composer-submit/i.test(meta)) return true;

    const type = String(control.getAttribute("type") || "").toLowerCase();
    if (type !== "submit") return false;

    const form = control.closest("form");
    return Boolean(form && editable && form.contains(editable));
  }

  function findLikelySendButton(el) {
    const treeRoot = el.getRootNode?.();
    const fallbackRoot = treeRoot?.querySelectorAll ? treeRoot : document;
    const root = el.closest("form") || el.closest('[role="dialog"], [role="main"], main, section, article') || fallbackRoot;
    const selectors = [
      '[data-testid="send-button"]',
      '[data-testid*="send" i]',
      'button[aria-label*="Send" i]',
      '[role="button"][aria-label*="Send" i]',
      'button[title*="Send" i]',
      '[role="button"][title*="Send" i]',
      'button[aria-label*="Gửi" i]',
      '[role="button"][aria-label*="Gửi" i]',
      'button[type="submit"]',
      'input[type="submit"]'
    ];

    for (const selector of selectors) {
      const controls = Array.from(root.querySelectorAll(selector)).filter(isVisibleAndEnabled);
      const matched = controls.find((control) => isLikelySendControl(control, el));
      if (matched) return matched;
    }

    return null;
  }

  function isVisibleAndEnabled(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function getPageUrl() {
    try {
      const ancestors = location.ancestorOrigins;
      const topOrigin = ancestors?.length ? ancestors[ancestors.length - 1] : "";
      if (topOrigin) {
        if (document.referrer) {
          const referrerUrl = new URL(document.referrer);
          if (referrerUrl.origin === topOrigin) return referrerUrl.href;
        }
        return topOrigin;
      }
    } catch {}

    return location.href;
  }

  function getPageOrigin() {
    try {
      return new URL(getPageUrl()).origin;
    } catch {
      return location.origin;
    }
  }

  function getContextHint() {
    try {
      const pageUrl = new URL(getPageUrl());
      const host = pageUrl.hostname.replace(/^www\./, "");
      const path = pageUrl.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
      return `${host}${path ? `/${path}` : ""}`;
    } catch {
      return location.hostname.replace(/^www\./, "");
    }
  }

  async function getSettings() {
    const response = await sendMessage({ type: "IB_GET_SETTINGS", origin: getPageOrigin() });
    return response?.settings || { enabled: false };
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(response);
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  function showToast(text) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "ib-toast";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.display = "block";
    clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      if (toastEl) toastEl.style.display = "none";
    }, 2200);
  }

  function renderLanguageOptions(currentLanguage) {
    const languages = Array.from(LANGUAGE_CATALOG?.ordered || []);
    const current = String(currentLanguage || "English").trim();
    if (current && !languages.some((language) => language.name === current)) {
      languages.unshift({ name: current, code: current });
    }

    return languages
      .map((language) => `<option value="${escapeHtml(language.name)}" ${language.name === current ? "selected" : ""}>${escapeHtml(language.name)}</option>`)
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
