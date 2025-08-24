const MENU_ID = "send_to_dify_copy";

// 初期化
chrome.runtime.onInstalled.addListener(() => createMenu());
createMenu();
function createMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "選択テキストをDifyに送信してコピー",
      contexts: ["selection"]
    });
  });
}

// 設定読み込み
async function getConfig() {
  const defaults = {
    apiBase: "",              // 例: https://dify.example.com
    apiKey: "",               // Workflow(またはApp)のAPIキー
    appType: "workflow",      // "workflow" | "chat"
    inputKey: "text",         // WorkflowのStart入力名
    outputKey: "text",        // ENDで出力するキー
    userId: "chrome-ext"      // Difyのuser識別子
  };
  const res = await chrome.storage.local.get(defaults);
  return Object.assign(defaults, res);
}

// Dify呼び出し（blockingで同期取得）
async function callDifyBlocking(cfg, selected) {
  const { apiBase, apiKey, appType, inputKey, outputKey, userId } = cfg;
  if (!apiBase || !apiKey) throw new Error("API Base / API Key を設定してください。");

  const base = apiBase.replace(/\/+$/, "");
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  if (appType === "workflow") {
    const url = `${base}/v1/workflows/run`;
    const body = { inputs: { [inputKey]: selected }, response_mode: "blocking", user: userId || "chrome-ext" };

    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const raw = await r.text();                    // ← 本文先読み
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${raw.slice(0, 500)}`); // ← 非2xxは必ずthrow
    const j = JSON.parse(raw);

    const outputs = j?.data?.outputs ?? j?.outputs ?? {};
    const candidate =
      typeof outputs === "string" ? outputs :
      outputs?.[outputKey] ?? outputs?.text ?? outputs?.result ?? JSON.stringify(outputs);

    if (!candidate) throw new Error("出力が空です（ENDノードの出力キーを確認）");
    return String(candidate);
  } else {
    const url = `${base}/v1/chat-messages`;
    const body = { inputs: {}, query: selected, response_mode: "blocking", conversation_id: "", user: userId || "chrome-ext" };

    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const raw = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${raw.slice(0, 500)}`);
    const j = JSON.parse(raw);

    const answer = j?.answer ?? j?.data?.answer;
    if (!answer) throw new Error("回答テキストが取得できませんでした。");
    return String(answer);
  }
}

// Offscreen経由でクリップボードへ（SWはDOM無しのため）
async function ensureOffscreen() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const has = await chrome.offscreen.hasDocument();
    if (!has) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["CLIPBOARD"],
        justification: "Dify結果をクリップボードへコピー"
      });
    }
  } else {
    // ほぼ無い想定: Offscreen未対応
    throw new Error("このブラウザはOffscreen APIに未対応です。");
  }
}

function copyViaOffscreen(text) {
  return new Promise(async (resolve) => {
    try {
      await ensureOffscreen();
      const id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        resolve(false);
      }, 4000);

      function listener(msg) {
        if (msg?.type === "offscreen-copy-result" && msg.id === id) {
          clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(listener);
          resolve(!!msg.ok);
        }
      }
      chrome.runtime.onMessage.addListener(listener);
      chrome.runtime.sendMessage({ type: "offscreen-copy", id, text });
    } catch (e) {
      resolve(false);
    }
  });
}

// 成功/失敗の通知（軽量）
function notify(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title, message
    });
  } catch { /* 権限無しでも無視 */ }
}

// 右クリック処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const selected = info.selectionText.trim();
  if (!selected) return;

  try {
    chrome.action.setBadgeText({ text: "…" });
    const cfg = await getConfig();
    const result = await callDifyBlocking(cfg, selected);
    const ok = await copyViaOffscreen(result);
    if (!ok) throw new Error("クリップボードへのコピーに失敗しました。");
    notify("Dify Copier", "結果をコピーしました。");
  } catch (e) {
    notify("Dify Copier: エラー", String(e.message || e));
  } finally {
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 800);
  }
});