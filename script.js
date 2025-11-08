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
function startCameraStream() {
  const camImg = document.getElementById("esp32-stream");
  const camStatus = document.getElementById("cam-status");
  const camURL = "http://10.139.23.104/"; // ← 已修改成新網址

  camImg.src = camURL;
  camStatus.textContent = "📡 嘗試連線中...";

  fetch(camURL, { method: "HEAD" })
    .then(() => {
      camStatus.textContent = "✅ 鏡頭已連線";
      camStatus.style.color = "green";
    })
    .catch(() => {
      camStatus.textContent = "⚠️ 鏡頭無法連線";
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
