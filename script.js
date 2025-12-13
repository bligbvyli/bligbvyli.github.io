
// =========================================================
// 血壓風險即時分析（不需訓練，直接使用回歸公式）
// =========================================================

document.getElementById("predict-btn").addEventListener("click", () => {
  const sys = parseFloat(document.getElementById("input-sys").value);
  const dia = parseFloat(document.getElementById("input-dia").value);
  const pulse = parseFloat(document.getElementById("input-pulse").value);

  if (!sys || !dia || !pulse) {
    alert("請輸入完整的收縮壓、舒張壓與脈搏！");
    return;
  }

  const risk = sys * 0.01 + dia * 0.01 + pulse * 0.0033 - 1.70;
  const riskScore = Math.max(0, Math.min(1, risk)); // 限制在 0~1 範圍

  const resultArea = document.getElementById("result-area");
  const riskText = document.getElementById("risk-score");
  const adviceText = document.getElementById("health-advice");

  resultArea.style.display = "block";
  riskText.textContent = riskScore.toFixed(2);

  if (riskScore < 0.45) {
    riskText.style.color = "green";
    adviceText.textContent = "✅ 數值正常。您的血壓符合健康標準。";
    adviceText.style.color = "green";
  } else if (riskScore < 0.75) {
    riskText.style.color = "orange";
    adviceText.textContent = "⚠️ 數值偏高，建議調整作息與飲食。";
    adviceText.style.color = "orange";
  } else {
    riskText.style.color = "red";
    adviceText.textContent = "🚨 數值過高，建議進一步就醫檢查。";
    adviceText.style.color = "red";
  }
});
