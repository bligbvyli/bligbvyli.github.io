const lightStatus = document.getElementById("light-status");
const lightOnBtn = document.getElementById("light-on");
const lightOffBtn = document.getElementById("light-off");

lightOnBtn.addEventListener("click", () => {
  document.body.style.backgroundColor = "#fffbe6";
  lightStatus.textContent = "目前狀態：💡 已開燈";
  lightStatus.style.color = "goldenrod";
});

lightOffBtn.addEventListener("click", () => {
  document.body.style.backgroundColor = "#f0f0f0";
  lightStatus.textContent = "目前狀態：💤 已關燈";
  lightStatus.style.color = "gray";
});

const uploadInput = document.getElementById("upload-image");
const analyzeBtn = document.getElementById("analyze-btn");
const previewImg = document.getElementById("preview");
const bpValue = document.getElementById("bp-value");

let uploadedImage = null;

uploadInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    previewImg.src = event.target.result;
    uploadedImage = event.target.result;
  };
  reader.readAsDataURL(file);
});

analyzeBtn.addEventListener("click", () => {
  if (!uploadedImage) {
    alert("請先上傳一張血壓圖片！");
    return;
  }
  bpValue.textContent = "血壓數值：辨識中...";
  bpValue.style.color = "gray";

  setTimeout(() => {
    const systolic = 110 + Math.floor(Math.random() * 30);
    const diastolic = 70 + Math.floor(Math.random() * 20);
    bpValue.textContent = `血壓數值：${systolic} / ${diastolic} mmHg`;
    bpValue.style.color = systolic > 130 ? "red" : "green";
  }, 1500);
});
