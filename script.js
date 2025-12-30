const tabs = document.querySelectorAll(".tab-btn");
const windows = document.querySelectorAll(".window");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    windows.forEach(w => w.classList.remove("active"));
    const targetWindow = document.getElementById(tab.dataset.tab);
    if (targetWindow) targetWindow.classList.add("active");
    if (tab.dataset.tab === "monitor") startCameraStream();
  });
});

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

// ESP32-CAM 串流
function startCameraStream() {
  const img = document.getElementById("esp32-stream");
  const camStatus = document.getElementById("cam-status");
  if (!img || !camStatus) return;
  camStatus.textContent = "📡 嘗試連線中...";
  const url = "http://10.0.0.1/stream";  // 修改為 ESP32-CAM 串流的實際 URL
  img.onload = () => { camStatus.textContent = "✅ 鏡頭已連線"; };
  img.onerror = () => { camStatus.textContent = "❌ 鏡頭連線失敗"; };
  img.src = "";
  setTimeout(() => { img.src = url; }, 100);
}

// 血壓儀照片上傳 OCR 處理
document.getElementById('bp-upload').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const ocrStatus = document.getElementById('ocr-status');
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
