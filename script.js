// 分頁切換
const tabs = document.querySelectorAll(".tab-btn");
const windows = document.querySelectorAll(".window");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    windows.forEach(w => w.classList.remove("active"));
    document.getElementById(target).classList.add("active");

    if (target === "monitor") startCameraStream();
  });
});

// ---------------- HM-10 藍牙控制 ----------------
let bleDevice;
let bleCharacteristic;

document.getElementById("ble-connect").addEventListener("click", async () => {
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "HM" }],
      optionalServices: [0xFFE0]
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(0xFFE0);
    bleCharacteristic = await service.getCharacteristic(0xFFE1);
    document.getElementById("ble-status").textContent = "✅ 已連線 HM-10";
  } catch (error) {
    console.error(error);
    document.getElementById("ble-status").textContent = "❌ 無法連線";
  }
});

document.getElementById("light-on").addEventListener("click", async () => {
  if (!bleCharacteristic) return alert("請先連線 HM-10！");
  await bleCharacteristic.writeValue(new TextEncoder().encode("ON"));
  document.getElementById("ble-status").textContent = "💡 已送出開燈命令";
});

document.getElementById("light-off").addEventListener("click", async () => {
  if (!bleCharacteristic) return alert("請先連線 HM-10！");
  await bleCharacteristic.writeValue(new TextEncoder().encode("OFF"));
  document.getElementById("ble-status").textContent = "🌑 已送出關燈命令";
});

// ---------------- ESP32-CAM 影像串流 ----------------
if (target === "monitor") startCameraStream();

function startCameraStream() {
   const camImg = document.getElementById("esp32-stream");
   const camStatus = document.getElementById("cam-status");
   const camURL = "/stream";  // using proxied stream path on same server
   camImg.src = camURL;
   camStatus.textContent = "📡 嘗試連線中...";  // "Attempting to connect..."

   // Optionally, we can check if the stream is reachable:
   fetch(camURL, { method: "HEAD" })
     .then(() => {
         camStatus.textContent = "✅ 鏡頭已連線";  // "Camera connected"
         camStatus.style.color = "green";
     })
     .catch(() => {
         camStatus.textContent = "⚠️ 鏡頭無法連線，請確認 ESP32-CAM 是否啟動"; // "Cannot connect, please check ESP32-CAM"
         camStatus.style.color = "red";
     });
}

// ---------------- 藍牙血壓計連線 ----------------
let bpCharacteristic;

document.getElementById("bp-connect").addEventListener("click", async () => {
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ["blood_pressure"] }]
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService("blood_pressure");
    bpCharacteristic = await service.getCharacteristic("blood_pressure_measurement");

    document.getElementById("bp-status").textContent = "✅ 已連線血壓計";

    bpCharacteristic.startNotifications().then(char => {
      char.addEventListener("characteristicvaluechanged", handleBPData);
    });
  } catch (error) {
    console.error(error);
    document.getElementById("bp-status").textContent = "❌ 無法連線血壓計";
  }
});

function handleBPData(event) {
  const value = event.target.value;
  const data = new DataView(value.buffer);

  // 血壓藍牙規範 (SIG: Blood Pressure Profile)
  let sys = data.getUint8(1);
  let dia = data.getUint8(3);
  let hr = data.getUint8(14);

  document.getElementById("sys").textContent = sys;
  document.getElementById("dia").textContent = dia;
  document.getElementById("hr").textContent = hr;
}
function startStream() {
  const esp32Url = "http://10.139.23.104/stream"; // ★★★ YOUR ESP32 地址 ★★★

  const img = document.getElementById("esp32-stream");
  img.src = esp32Url;

  alert("開始串流影像！");
}

// 分頁切換邏輯 (保持不變)
const tabs = document.querySelectorAll(".tab-btn");
const windows = document.querySelectorAll(".window");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    windows.forEach(w => w.classList.remove("active"));
    document.getElementById(target).classList.add("active");
    if (target === "monitor") startCameraStream();
  });
});

// ... (保留 HM-10 藍牙控制 & ESP32-CAM 影像串流 程式碼，這裡省略以節省篇幅) ...


// =========================================================
// 🩺 AI 血壓分析系統 (TensorFlow.js 線性回歸)
// =========================================================

let model;
let isTrained = false;

// 1. 生成 50 筆「正常」數據供模型學習
// 為了讓線性回歸能學出趨勢，我們需要在正常範圍內保留一點「梯度」
// 例如：110/70 是極好 (0.1)，129/84 是正常偏高 (0.4)
function generateNormalData(count = 50) {
    const data = [];
    for (let i = 0; i < count; i++) {
        // 隨機生成收縮壓 (SYS) 90 ~ 130 (正常範圍)
        const sys = Math.floor(Math.random() * (130 - 90 + 1)) + 90;
        // 隨機生成舒張壓 (DIA) 60 ~ 85 (正常範圍)
        const dia = Math.floor(Math.random() * (85 - 60 + 1)) + 60;
        
        // 根據一個簡單的醫學邏輯計算「假想風險值」作為訓練標籤 (Label)
        // 這就是我們教導模型的過程：告訴它這些數值對應什麼樣的風險
        // 正規化：簡單將血壓映射到 0.0 ~ 0.5 (因為這些都是正常數據)
        let risk = ((sys - 90) / 100) * 0.5 + ((dia - 60) / 60) * 0.5; 
        
        // 加入一點隨機雜訊，模擬真實世界的數據波動
        risk += (Math.random() * 0.05); 

        data.push({ xs: [sys, dia], ys: [risk] });
    }
    return data;
}

// 2. 點擊「訓練」按鈕
document.getElementById("train-btn").addEventListener("click", async () => {
    const statusText = document.getElementById("train-status");
    const trainBtn = document.getElementById("train-btn");
    
    statusText.textContent = "⏳ 正在生成 50 筆正常數據...";
    trainBtn.disabled = true;

    // 準備數據
    const trainingData = generateNormalData(50);
    
    // 轉換為 Tensor
    const xs = tf.tensor2d(trainingData.map(d => d.xs));
    const ys = tf.tensor2d(trainingData.map(d => d.ys));

    statusText.textContent = "🧠 神經網路建構中...";

    // 定義模型：線性回歸 (1層 Dense Layer, 2個輸入 -> 1個輸出)
    model = tf.sequential();
    model.add(tf.layers.dense({ units: 1, inputShape: [2] }));

    // 編譯模型 (優化器: Adam, 損失函數: 均方誤差)
    model.compile({ optimizer: tf.train.adam(0.05), loss: 'meanSquaredError' });

    statusText.textContent = "🚀 開始訓練 (Epochs: 0/100)...";

    // 開始訓練
    await model.fit(xs, ys, {
        epochs: 100,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                // 每 20 次迭代更新一次顯示，讓使用者有感
                if (epoch % 20 === 0) {
                    statusText.textContent = `🚀 正在學習血壓趨勢 (Epochs: ${epoch}/100)... Loss: ${logs.loss.toFixed(4)}`;
                }
            }
        }
    });

    // 訓練完成
    isTrained = true;
    statusText.textContent = "✅ 學習完成！已紀錄 50 筆數據特徵。現在可以輸入異常數據進行測試。";
    statusText.style.color = "green";
    
    // 啟用分析按鈕
    const predictBtn = document.getElementById("predict-btn");
    predictBtn.disabled = false;
    predictBtn.style.background = "#0078ff";
    predictBtn.style.cursor = "pointer";
    predictBtn.textContent = "🔍 開始分析";

    // 釋放記憶體
    xs.dispose();
    ys.dispose();
});

// 3. 點擊「分析」按鈕
document.getElementById("predict-btn").addEventListener("click", () => {
    const sys = parseFloat(document.getElementById("input-sys").value);
    const dia = parseFloat(document.getElementById("input-dia").value);

    if (!sys || !dia) return alert("請輸入完整的血壓數值！");
    
    predictHealth(sys, dia);
});

// 4. 快速測試按鈕邏輯
document.querySelectorAll(".test-preset").forEach(btn => {
    btn.addEventListener("click", () => {
        document.getElementById("input-sys").value = btn.dataset.sys;
        document.getElementById("input-dia").value = btn.dataset.dia;
        // 如果已經訓練過，直接觸發分析
        if (isTrained) predictHealth(parseFloat(btn.dataset.sys), parseFloat(btn.dataset.dia));
        else alert("請先執行步驟 1：模型學習！");
    });
});

// 5. 預測核心函數
function predictHealth(sys, dia) {
    if (!model) return;

    // 將輸入轉為 Tensor
    const input = tf.tensor2d([[sys, dia]]);
    
    // 預測
    const result = model.predict(input);
    const riskScore = result.dataSync()[0]; // 獲取數值

    // 顯示結果
    const resultArea = document.getElementById("result-area");
    const riskText = document.getElementById("risk-score");
    const adviceText = document.getElementById("health-advice");

    resultArea.style.display = "block";
    riskText.textContent = riskScore.toFixed(2); // 顯示到小數點後兩位

    // 雖然模型只看過正常數據(0.1~0.5)，但線性方程式會自動將高血壓(如160)
    // 推算為更高的數值(例如 > 0.8)，這就是線性回歸的「外推」能力。
    if (riskScore < 0.4) {
        riskText.style.color = "green";
        adviceText.textContent = "✅ 數值正常。您的血壓符合模型學習到的健康標準。";
        adviceText.style.color = "green";
    } else if (riskScore < 0.7) {
        riskText.style.color = "orange";
        adviceText.textContent = "⚠️ 數值偏高。模型偵測到偏離正常基準，建議注意飲食。";
        adviceText.style.color = "orange";
    } else {
        riskText.style.color = "red";
        adviceText.textContent = "🚨 數據異常！模型判定此數值嚴重超出學習過的正常範圍，請立即就醫。";
        adviceText.style.color = "red";
    }

    input.dispose();
    result.dispose();
}
