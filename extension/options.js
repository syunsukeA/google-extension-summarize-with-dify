const els = {
    apiBase: document.getElementById("apiBase"),
    apiKey: document.getElementById("apiKey"),
    appType: document.getElementById("appType"),
    inputKey: document.getElementById("inputKey"),
    outputKey: document.getElementById("outputKey"),
    userId: document.getElementById("userId"),
    save: document.getElementById("save"),
  };
  
  const defaults = {
    apiBase: "",
    apiKey: "",
    appType: "workflow",
    inputKey: "text",
    outputKey: "text",
    userId: "chrome-ext",
  };
  
  async function load() {
    const v = await chrome.storage.local.get(defaults);
    Object.entries(v).forEach(([k, val]) => { if (els[k]) els[k].value = val; });
  }
  async function save() {
    const v = {
      apiBase: els.apiBase.value.trim(),
      apiKey: els.apiKey.value.trim(),
      appType: els.appType.value,
      inputKey: els.inputKey.value.trim() || "text",
      outputKey: els.outputKey.value.trim() || "text",
      userId: els.userId.value.trim() || "chrome-ext",
    };
    await chrome.storage.local.set(v);
    els.save.textContent = "保存しました";
    setTimeout(() => (els.save.textContent = "保存"), 1200);
  }
  els.save.addEventListener("click", save);
  load();