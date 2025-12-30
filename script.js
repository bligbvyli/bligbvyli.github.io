 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/script.js b/script.js
index f782457e68cfa7513d72b45a3b13aec3a2c75d82..adfd49f4c9ee098f1726effc0fc9399efd010b55 100644
--- a/script.js
+++ b/script.js
@@ -1,36 +1,35 @@
 const tabs = document.querySelectorAll(".tab-btn");
 const windows = document.querySelectorAll(".window");
 
-tabs.forEach(tab => {
-  tab.addEventListener("click", () => {
-    windows.forEach(w => w.classList.remove("active"));
-    const targetWindow = document.getElementById(tab.dataset.tab);
-    if (targetWindow) targetWindow.classList.add("active");
-    if (tab.dataset.tab === "monitor") startCameraStream();
-  });
-});
+tabs.forEach(tab => {
+  tab.addEventListener("click", () => {
+    windows.forEach(w => w.classList.remove("active"));
+    const targetWindow = document.getElementById(tab.dataset.tab);
+    if (targetWindow) targetWindow.classList.add("active");
+  });
+});
 
 let model;
 let isTrained = false;
 
 document.getElementById("train-btn").addEventListener("click", async () => {
   const statusText = document.getElementById("train-status");
   statusText.textContent = "訓練中...";
   const trainingData = [];
   // 生成模擬訓練資料 (50 筆隨機的血壓與風險值)
   for (let i = 0; i < 50; i++) {
     const sys = Math.floor(Math.random() * 41) + 90;
     const dia = Math.floor(Math.random() * 26) + 60;
     const risk = ((sys - 90) / 100) * 0.5 + ((dia - 60) / 60) * 0.5 + (Math.random() * 0.05);
     trainingData.push({ xs: [sys, dia], ys: [risk] });
   }
   const xs = tf.tensor2d(trainingData.map(d => d.xs));
   const ys = tf.tensor2d(trainingData.map(d => d.ys));
   model = tf.sequential();
   model.add(tf.layers.dense({ units: 1, inputShape: [2] }));
   model.compile({ optimizer: tf.train.adam(0.05), loss: 'meanSquaredError' });
   await model.fit(xs, ys, { epochs: 100 });
   isTrained = true;
   statusText.textContent = "✅ 模型訓練完成";
   document.getElementById("predict-btn").disabled = false;
 });
@@ -38,66 +37,108 @@ document.getElementById("train-btn").addEventListener("click", async () => {
 document.getElementById("predict-btn").addEventListener("click", () => {
   const sys = parseFloat(document.getElementById("input-sys").value);
   const dia = parseFloat(document.getElementById("input-dia").value);
   if (!isTrained || isNaN(sys) || isNaN(dia)) return;
   const input = tf.tensor2d([[sys, dia]]);
   const prediction = model.predict(input);
   const riskScore = prediction.dataSync()[0];
   document.getElementById("risk-score").textContent = riskScore.toFixed(2);
   const advice = document.getElementById("health-advice");
   const resultArea = document.getElementById("result-area");
   resultArea.style.display = "block";
   if (riskScore < 0.45) {
     advice.textContent = "✅ 正常血壓";
     advice.style.color = "green";
   } else if (riskScore < 0.75) {
     advice.textContent = "⚠️ 稍高，請注意飲食";
     advice.style.color = "orange";
   } else {
     advice.textContent = "🚨 異常，建議就醫";
     advice.style.color = "red";
   }
   input.dispose();
   prediction.dispose();
 });
 
-// ESP32-CAM 串流
-function startCameraStream() {
-  const img = document.getElementById("esp32-stream");
-  const camStatus = document.getElementById("cam-status");
-  if (!img || !camStatus) return;
-  camStatus.textContent = "📡 嘗試連線中...";
-  const url = "http://10.0.0.1/stream";  // 修改為 ESP32-CAM 串流的實際 URL
-  img.onload = () => { camStatus.textContent = "✅ 鏡頭已連線"; };
-  img.onerror = () => { camStatus.textContent = "❌ 鏡頭連線失敗"; };
-  img.src = "";
-  setTimeout(() => { img.src = url; }, 100);
-}
-
-// 血壓儀照片上傳 OCR 處理
-document.getElementById('bp-upload').addEventListener('change', async (event) => {
-  const file = event.target.files[0];
-  if (!file) return;
-  const ocrStatus = document.getElementById('ocr-status');
+// ESP32-CAM 串流
+function startCameraStream() {
+  const img = document.getElementById("esp32-stream");
+  const camStatus = document.getElementById("cam-status");
+  const urlInput = document.getElementById("stream-url");
+  if (!img || !camStatus) return;
+  const url = (urlInput?.value || "").trim();
+
+  if (!url) {
+    camStatus.textContent = "❌ 請先輸入串流網址";
+    return;
+  }
+
+  const isHttpsPage = window.location.protocol === "https:";
+  const isHttpStream = url.startsWith("http://");
+  if (isHttpsPage && isHttpStream) {
+    camStatus.textContent = "⚠️ 本站為 HTTPS，請改用 HTTPS 串流或同網段 HTTP 頁面以避免混合內容被阻擋";
+  } else {
+    camStatus.textContent = "📡 嘗試連線中...";
+  }
+
+  localStorage.setItem("esp32StreamUrl", url);
+
+  img.onload = () => { camStatus.textContent = "✅ 鏡頭已連線"; };
+  img.onerror = () => { camStatus.textContent = "❌ 鏡頭連線失敗"; };
+  img.src = "";
+  setTimeout(() => { img.src = url; }, 100);
+}
+
+function restoreStreamUrl() {
+  const urlInput = document.getElementById("stream-url");
+  if (!urlInput) return;
+  const saved = localStorage.getItem("esp32StreamUrl") || "";
+  if (saved) {
+    urlInput.value = saved;
+    const camStatus = document.getElementById("cam-status");
+    if (camStatus) camStatus.textContent = "ℹ️ 已載入上次的串流網址，請按「開始影像串流」";
+  }
+}
+
+document.getElementById("stream-start")?.addEventListener("click", startCameraStream);
+document.getElementById("stream-save")?.addEventListener("click", () => {
+  const urlInput = document.getElementById("stream-url");
+  if (!urlInput) return;
+  const val = urlInput.value.trim();
+  if (val) {
+    localStorage.setItem("esp32StreamUrl", val);
+    document.getElementById("cam-status").textContent = "💾 串流網址已儲存";
+  } else {
+    document.getElementById("cam-status").textContent = "❌ 尚未輸入串流網址";
+  }
+});
+
+restoreStreamUrl();
+
+// 血壓儀照片上傳 OCR 處理
+document.getElementById('bp-upload').addEventListener('change', async (event) => {
+  const file = event.target.files[0];
+  if (!file) return;
+  const ocrStatus = document.getElementById('ocr-status');
   ocrStatus.textContent = "🔄 讀取中...";
   try {
     const { data: { text } } = await Tesseract.recognize(file, 'eng');
     const numbers = text.match(/\d+/g);
     if (numbers && numbers.length >= 2) {
       const sysVal = parseInt(numbers[0], 10);
       const diaVal = parseInt(numbers[1], 10);
       document.getElementById('input-sys').value = sysVal;
       document.getElementById('input-dia').value = diaVal;
       ocrStatus.textContent = "✅ 數值擷取完成";
       if (isTrained) {
         document.getElementById('predict-btn').click();
       } else {
         ocrStatus.textContent += "，請先訓練模型";
       }
     } else {
       ocrStatus.textContent = "❌ 未能識別血圧數值";
     }
   } catch (error) {
     console.error(error);
     ocrStatus.textContent = "❌ OCR 失敗";
   }
 });
 
EOF
)