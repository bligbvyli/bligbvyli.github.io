document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupMonitor();       // 監控頁仍可用（不需網址也能運作，只是串流要你填 ESP32 URL）
  setupBloodPressure(); // 血壓：改成本機 OCR + 線性回歸判斷（無任何外部 API）
});

/* ===============================
   1) 分頁切換（.tab-btn -> .window）
================================ */
function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  const windows = document.querySelectorAll(".window");
  if (!tabs.length || !windows.length) return;

  const activeWin = [...windows].find(w => w.classList.contains("active")) || windows[0];
  windows.forEach(w => w.classList.toggle("active", w === activeWin));

  const matchTab = [...tabs].find(t => t.dataset.tab === activeWin.id) || tabs[0];
  tabs.forEach(t => t.classList.remove("active"));
  matchTab.classList.add("active");

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
   - 不依賴外部服務
   - 仍需要你輸入 ESP32 的串流網址
================================ */
function setupMonitor() {
  const urlInput = document.getElementById("stream-url");
  const saveBtn = document.getElementById("stream-save");
  const startBtn = document.getElementById("stream-start");
  const img = document.getElementById("esp32-stream");
  const status = document.getElementById("cam-status");

  // 若 index 沒有 monitor 元素，直接跳過不報錯
  if (!urlInput || !saveBtn || !startBtn || !img || !status) return;

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

function startCameraStream(url, img, status) {
  if (!url) {
    status.textContent = "❌ 請先輸入串流網址";
    return;
  }

  const isHttpsPage = window.location.protocol === "https:";
  const isHttpStream = url.startsWith("http://");
  if (isHttpsPage && isHttpStream) {
    status.textContent = "⚠️ 本站是 HTTPS，HTTP 串流可能被阻擋（混合內容）。";
  } else {
    status.textContent = "📡 嘗試連線中...";
  }

  localStorage.setItem("esp32StreamUrl", url);

  img.onload = () => status.textContent = "✅ 鏡頭已連線";
  img.onerror = () => status.textContent = "❌ 鏡頭連線失敗（請確認 URL/ESP32）";

  img.src = "";
  setTimeout(() => {
    const bust = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    img.src = url + bust;
  }, 100);
}

/* ===============================
   3) 血壓：本機 OCR + 線性回歸方程式判斷
   - 不使用任何網址/外部 API
   - 需要在 index.html 引入 Tesseract.js CDN
================================ */
function setupBloodPressure() {
  // 讓 index 的 inline handler 可呼叫
  window.previewImage = previewImage;
  window.uploadImage = uploadImage;   // 這裡改為「本機 OCR 辨識」
  window.submitData = submitData;     // 這裡改為「本機判斷 +（可選）存 localStorage」
}

function previewImage() {
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
    if (bpResult) bpResult.textContent = "已載入照片，請按「開始辨識」（本機 OCR）。";
  };
  reader.readAsDataURL(file);
}

/**
 * uploadImage(): 改為「本機 OCR」辨識
 */
async function uploadImage() {
  const photoInput = document.getElementById("photoInput");
  const bpResult = document.getElementById("bp-result");
  const recognizeBtn = document.getElementById("recognizeBtn");

  const sysEl = document.getElementById("sys");
  const diaEl = document.getElementById("dia");

  const file = photoInput?.files?.[0];
  if (!file || !bpResult) return;

  if (typeof Tesseract === "undefined") {
    bpResult.textContent = "❌ 找不到 Tesseract.js。請確認 index.html 已加入 Tesseract CDN。";
    return;
  }

  recognizeBtn && (recognizeBtn.disabled = true);
  bpResult.textContent = "⏳ 本機 OCR 辨識中（可能需要幾秒）...";

  try {
    const { data } = await Tesseract.recognize(file, "eng", {
      logger: (m) => {
        // 你想看進度可打開下一行
        // console.log(m);
      }
    });

    const text = (data?.text || "").trim();
    if (!text) {
      bpResult.textContent = "❌ 沒讀到文字，請換清晰照片或手動輸入。";
      return;
    }

    // 嘗試抓取 120/80 或兩個數字
    const extracted = extractSysDia(text);
    if (!extracted) {
      bpResult.textContent = "⚠️ OCR 有讀到文字，但未能解析 SYS/DIA。請手動輸入。\n\nOCR 文字：\n" + text;
      return;
    }

    if (sysEl) sysEl.value = extracted.sys;
    if (diaEl) diaEl.value = extracted.dia;

    bpResult.textContent = `✅ 辨識完成：${extracted.sys}/${extracted.dia}\n（你可直接按「送出資料」做本機判斷）`;

  } catch (err) {
    console.error(err);
    bpResult.textContent = "❌ OCR 辨識失敗，請手動輸入。";
  } finally {
    recognizeBtn && (recognizeBtn.disabled = false);
  }
}

/**
 * submitData(): 改為「本機判斷」
 * - 用線性回歸方程式做健康判斷
 * - 可選：把紀錄存 localStorage（不用後端）
 */
function submitData() {
  const msg = document.getElementById("msg");

  const sys = toNumber(document.getElementById("sys")?.value);
  const dia = toNumber(document.getElementById("dia")?.value);
  const pulse = toNumber(document.getElementById("pulse")?.value);

  if (!sys || !dia) {
    alert("請填寫收縮壓（SYS）與舒張壓（DIA）。");
    return;
  }

  const result = evaluateByLinearRegression(sys, dia);

  const advice = buildAdvice(sys, dia, pulse, result);

  if (msg) {
    msg.textContent =
      `判斷結果：${result.isHealthy ? "✅ 較正常" : "⚠️ 需注意"}\n` +
      `分數：${result.score.toFixed(3)}（閾值：${result.threshold}）\n` +
      `說明：${result.note}\n\n` +
      `建議：\n${advice}`;
  }

  // 可選：存到 localStorage（不用後端）
  saveBpRecord({ sys, dia, pulse, ...result, time: new Date().toISOString() });
}

/* ===============================
   線性回歸方程式（你提供的）
   abs(sys - (dia * -0.3738 + 163.8)) > 11.943303
================================ */
function evaluateByLinearRegression(sys, dia) {
  const threshold = 11.943303;
  const predictedSys = (dia * -0.3738 + 163.8);
  const score = Math.abs(sys - predictedSys);

  const isHealthy = score <= threshold;
  return {
    threshold,
    predictedSys,
    score,
    isHealthy,
    note: isHealthy
      ? "SYS 與 DIA 的關係落在模型允許範圍內。"
      : "SYS 與 DIA 的關係偏離模型範圍，建議再量測或留意生活型態。"
  };
}

/* ===============================
   建議（簡單、實用）
================================ */
function buildAdvice(sys, dia, pulse, lrResult) {
  const lines = [];

  // 依你的線性回歸判斷
  if (!lrResult.isHealthy) {
    lines.push("1) 建議在 5 分鐘安靜休息後重新量測 1–2 次，取平均值。");
    lines.push("2) 減少高鈉飲食（鹽、醃漬、湯品）、增加蔬果與水分。");
    lines.push("3) 規律運動（每週至少 150 分鐘中等強度），避免熬夜與過量咖啡因。");
    lines.push("4) 若多次量測仍偏離或伴隨不適（頭暈、胸悶），建議就醫評估。");
  } else {
    lines.push("1) 維持規律作息與運動習慣。");
    lines.push("2) 飲食少油少鹽，多蔬果。");
    lines.push("3) 建議每週固定時間紀錄，觀察趨勢。");
  }

  // 參考一般血壓區間（非醫療診斷，只做提醒）
  if (sys >= 140 || dia >= 90) {
    lines.push("※ 提醒：你輸入的血壓數值偏高區間（僅提醒，非診斷），建議與醫師討論。");
  } else if (sys >= 130 || dia >= 80) {
    lines.push("※ 提醒：可能接近偏高區間，請留意飲食與運動。");
  }

  if (pulse && pulse >= 100) {
    lines.push("※ 心跳偏快：若在休息狀態仍偏快，建議觀察與諮詢專業。");
  }

  return lines.join("\n");
}

/* ===============================
   localStorage 紀錄（可選）
================================ */
function saveBpRecord(record) {
  try {
    const key = "bpRecords";
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    arr.unshift(record);
    // 只保留最近 50 筆，避免無限長
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 50)));
  } catch (e) {
    console.warn("localStorage 儲存失敗：", e);
  }
}

/* ===============================
   工具函式
================================ */
function toNumber(v) {
  const n = Number(String(v || "").trim());
  return Number.isFinite(n) ? n : 0;
}

// 解析 120/80、120 / 80、或抓前兩個 2~3 位數字
function extractSysDia(text) {
  const m = text.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (m) return { sys: m[1], dia: m[2] };

  const nums = (text.match(/\d{2,3}/g) || []).map(s => s.trim());
  if (nums.length >= 2) return { sys: nums[0], dia: nums[1] };

  return null;
}
