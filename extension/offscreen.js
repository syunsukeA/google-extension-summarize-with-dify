chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg?.type !== "offscreen-copy") return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(String(msg.text ?? ""));
      ok = true;
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = String(msg.text ?? "");
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        ok = true;
      } catch { ok = false; }
    } finally {
      chrome.runtime.sendMessage({ type: "offscreen-copy-result", id: msg.id, ok });
    }
  });