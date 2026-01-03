/* ===============================
   0) 你必須改的兩個網址（不改會無法送出/辨識）
================================ */
const SCRIPT_URL  = "請填入你的_GAS_SCRIPT_URL"; 
const NETLIFY_API = "請填入你的_NETLIFY_API_URL"; // 例：https://xxx.netlify.app/.netlify/functions/recognize

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupMonitor();
  setupBloodPressure();
});

/* ===============================
   1) 分頁切換（.tab-btn -> .window）
================================ */
function setupTabs(){
  const tabs = document.querySelectorAll(".tab-btn");
  const windows = document.querySelectorAll(".window");

  if (!tabs.length || !windows.length) return;

  // 預設啟用第一個 tab（若 HTML 沒有先加 active）
  if (![...windows].some(w => w.classList.contains("active"))) {
    windows[0].classList.add("active");
    tabs[0]?.classList.add("active");
  } else {
    // 若 window 已 active，對應的 tab 也補上 active
    const activeWin = [...windows].find(w => w.classList.contains("active"));
    if (activeWin) {
      const t = [...tabs].find(x => x.dataset.tab === activeWin.id);
      t?.classList.add("active");
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const targetId = tab.dataset.tab;
      windows.forEach(w => w.classList.toggle("active", w.id === targetId));
    });
  });
}

/* ===============================
   2) ESP32-CAM 串流（可存 URL）
   需要 index 內存在：
   #stream-url, #stream-save, #stream-start, #esp32-stream, #cam-status
================================ */
function setupMonitor(){
  const urlInput = document.getElementById("stream-url");
  const saveBtn  = document.getElementById("stream-save");
  const startBtn = document.getElementById("stream-start");
  const img      = document.getElementById("esp32-stream");
  const status   = document.getElementById("cam-status");

  // 如果你的 index 沒有遠端監控區塊，直接跳過不報錯
  if (!urlInput || !saveBtn || !startBtn || !img || !status) return;

  // 還原上次儲存
  const saved = localStorage.getItem("esp32StreamUrl") || "";
  if (saved) {
    urlInput.value = saved;
    status.textContent = "ℹ️ 已載入上次的串流網址，請按「開始影像串流」";
  }

  saveBtn.addEventListener("click", () => {
    const val = urlInput.value.trim();
    if (!val) {
      status.textContent = "❌ 尚未輸入串流網址";
      return;
    }
    localStorage.setItem("esp32StreamUrl", val);
    status.textContent = "💾 串流網址已儲存";
  });

  startBtn.addEventListener("click", () => {
    startCameraStream(urlInput.value.trim(), img, status);
  });
}

function startCameraStream(url, img, status){
  if (!url) {
    status.textContent = "❌ 請先輸入串流網址";
    return;
  }

  // HTTPS 混合內容提醒
  const isHttpsPage = window.location.protocol === "https:";
  const isHttpStream = url.startsWith("http://");
  if (isHttpsPage && isHttpStream) {
    status.textContent = "⚠️ 本站是 HTTPS，HTTP 串流可能被瀏覽器阻擋（混合內容）。建議改用 HTTPS 或同網段 HTTP 測試。";
  } else {
    status.textContent = "📡 嘗試連線中...";
  }

  localStorage.setItem("esp32StreamUrl", url);

  img.onload = () => status.textContent = "✅ 鏡頭已連線";
  img.onerror = () => status.textContent = "❌ 鏡頭連線失敗（請確認 URL、ESP32 是否在線）";

  // 清空再載入（避免快取）
  img.src = "";
  setTimeout(() => {
    const bust = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    img.src = url + bust;
  }, 100);
}

/* ===============================
   3) 血壓：上傳預覽 / AI 辨識 / 送出 GAS
   需要 index 內存在：
   #photoInput #bp-preview #recognizeBtn #bp-result #sys #dia #pulse #msg
================================ */
function setupBloodPressure(){
  // 讓 inline HTML 可以叫得到
  window.previewImage = previewImage;
  window.uploadImage  = uploadImage;
  window.submitData   = submitData;
}

function previewImage(){
  const photoInput = document.getElementById("photoInput");
  const bpPreview = document.getElementById("bp-preview");
  const recognizeBtn = document.getElementById("recognizeBtn");
  const bpResult = document.getElementById("bp-result");

  const file = photoInput?.files?.[0];
  if (!file || !bpPreview || !recognizeBtn) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    bpPreview.src = e.target.result;
    bpPreview.style.display = "block";
    recognizeBtn.style.display = "inline-block";
    if (bpResult) bpResult.textContent = "已載入照片，請按「開始辨識」。";
  };
  reader.readAsDataURL(file);
}

async function uploadImage(){
  const photoInput = document.getElementById("photoInput");
  const bpResult = document.getElementById("bp-result");
  const recognizeBtn = document.getElementById("recognizeBtn");

  const file = photoInput?.files?.[0];
  if (!file || !bpResult) return;

  if (!NETLIFY_API || NETLIFY_API.includes("請填入")) {
    bpResult.textContent = "⚠️ 尚未設定 NETLIFY_API，請先在 script.js 填入你的網址。";
    return;
  }

  recognizeBtn && (recognizeBtn.disabled = true);
  bpResult.textContent = "⏳ 辨識中...";

  try {
    const base64 = await fileToBase64(file);

    const res = await fetch(NETLIFY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64, mimeType: file.type })
    });

    if (!res.ok) throw new Error("辨識服務回應失敗：" + res.status);

    const data = await res.json();
    const text = (data?.text ?? "").toString().trim();

    if (!text) {
      bpResult.textContent = "❌ 辨識無結果，請換清晰照片或改手動輸入。";
      return;
    }

    bpResult.textContent = "辨識結果：" + text;

    // 自動填入（預期 120/80）
    const extracted = extractSysDia(text);
    if (extracted) {
      const sysEl = document.getElementById("sys");
      const diaEl = document.getElementById("dia");
      if (sysEl) sysEl.value = extracted.sys;
      if (diaEl) diaEl.value = extracted.dia;
    }
  } catch (err) {
    console.error(err);
    bpResult.textContent = "❌ 辨識失敗，請手動輸入。";
  } finally {
    recognizeBtn && (recognizeBtn.disabled = false);
  }
}

async function submitData(){
  const msg = document.getElementById("msg");
  const sys = document.getElementById("sys")?.value?.trim();
  const dia = document.getElementById("dia")?.value?.trim();
  const pulse = document.getElementById("pulse")?.value?.trim();

  if (!sys || !dia) {
    alert("請填寫收縮壓（SYS）與舒張壓（DIA）。");
    return;
  }

  if (!SCRIPT_URL || SCRIPT_URL.includes("請填入")) {
    msg && (msg.textContent = "⚠️ 尚未設定 SCRIPT_URL，請先在 script.js 填入你的 GAS Web App 網址。");
    return;
  }

  if (msg) {
    msg.style.color = "";
    msg.textContent = "⏳ 資料上傳中...";
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sys, dia, pulse })
    });

    // GAS 有時回傳不是 JSON（或被 CORS 擋），用 text 比較穩
    const text = await response.text();
    if (!text) {
      if (msg) msg.textContent = "⚠️ 已送出，但未讀到回傳內容。若試算表有新增資料，通常代表成功。";
      return;
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      if (msg) msg.textContent = "⚠️ 已送出，但回傳格式非 JSON。請確認試算表是否有新增資料。";
      return;
    }

    if (result.result === "ok") {
      if (msg) msg.textContent = "✅ 已成功存入！判斷結果：" + (result.status || "完成");
      clearBpForm();
    } else {
      if (msg) msg.textContent = "❌ 存入失敗：" + (result.message || "未知錯誤");
    }
  } catch (error) {
    console.error("提交錯誤:", error);
    if (msg) msg.textContent = "⚠️ 資料已嘗試送出，但可能因 CORS 無法讀取回傳。請檢查試算表是否有新增資料。";
  }
}

function clearBpForm(){
  const ids = ["sys","dia","pulse"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function extractSysDia(text){
  // 120/80
  const m = text.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (m) return { sys: m[1], dia: m[2] };

  // fallback：抓前兩個 2~3 位數字
  const nums = (text.match(/\d{2,3}/g) || []).map(s => s.trim());
  if (nums.length >= 2) return { sys: nums[0], dia: nums[1] };
  return null;
}
