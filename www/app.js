const apiStatus = document.querySelector("#apiStatus");
const tankSelect = document.querySelector("#tankSelect");
const form = document.querySelector("#calcForm");
const rangeHelp = document.querySelector("#rangeHelp");
const errorBox = document.querySelector("#errorBox");
const correctedVolumeResult = document.querySelector("#correctedVolumeResult");
const volumeResult = document.querySelector("#volumeResult");
const weightResult = document.querySelector("#weightResult");
const temperatureVcf = document.querySelector("#temperatureVcf");
const rawSound = document.querySelector("#rawSound");
const heelCorrection = document.querySelector("#heelCorrection");
const correctedSound = document.querySelector("#correctedSound");
const totalSummary = document.querySelector("#totalSummary");

const STORAGE_KEY = "sounding-calculator:tank-states:v2";
const TOTAL_TANK_ID = "__tank-total__";
const TOTAL_TANK_LABEL = "탱크 총합";
const APP_NAME = "SM PUMA 벙커 계산 프로그램";
const APP_AUTHOR = "윤형국";

let tankData = null;
let tanks = [];
let isRestoringState = false;
let currentTotalReport = null;

function setError(message) {
  errorBox.hidden = !message;
  errorBox.textContent = message || "";
}

function formatNumber(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function selectedTank() {
  return tanks.find((tank) => tank.id === tankSelect.value);
}

function isTotalSelected() {
  return tankSelect.value === TOTAL_TANK_ID;
}

function isMgoTank(tank) {
  return tank?.oil_type === "LSMGO" || tank?.oil_type === "MGO";
}

function updateTankSelectStyle() {
  tankSelect.classList.toggle("total-selected", isTotalSelected());
  tankSelect.classList.toggle("mgo-selected", isMgoTank(selectedTank()));
}

function loadStoredStates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function saveStoredStates(states) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
}

function emptyResult() {
  return {
    corrected_volume_m3: null,
    volume_m3: null,
    metric_ton: null,
    temperature_vcf: null,
    raw_sound_cm: null,
    heel_correction_cm: null,
    corrected_sound_cm: null
  };
}

function defaultStateForTank(tank) {
  return {
    input: {
      measurement_type: "sounding",
      measurement_cm: 0,
      trim_m: 0,
      heel_deg: 0,
      temperature_c: tank?.reference_temp_c ?? 15,
      density: tank?.default_density ?? 0.98
    },
    result: null
  };
}

function currentInputState() {
  const formData = new FormData(form);
  const densityValue = formData.get("density");
  const temperatureValue = formData.get("temperature_c");
  return {
    measurement_type: formData.get("measurement_type"),
    measurement_cm: Number(formData.get("measurement_cm")),
    trim_m: Number(formData.get("trim_m")),
    heel_deg: Number(formData.get("heel_deg")),
    temperature_c: temperatureValue === "" ? null : Number(temperatureValue),
    density: densityValue === "" ? null : Number(densityValue)
  };
}

function saveCurrentTankState(result) {
  if (isRestoringState || !tankSelect.value || isTotalSelected()) return;
  const states = loadStoredStates();
  const previous = states[tankSelect.value] || {};
  states[tankSelect.value] = {
    input: currentInputState(),
    result: result === undefined ? previous.result || null : result
  };
  saveStoredStates(states);
}

function applyInputState(input) {
  form.elements.measurement_type.value = input.measurement_type || "sounding";
  form.elements.measurement_cm.value = input.measurement_cm ?? 0;
  form.elements.trim_m.value = input.trim_m ?? 0;
  form.elements.heel_deg.value = input.heel_deg ?? 0;
  form.elements.temperature_c.value = input.temperature_c ?? "";
  form.elements.density.value = input.density ?? "";
}

function setCalculationFieldsDisabled(disabled) {
  Array.from(form.elements).forEach((element) => {
    if (element === tankSelect) return;
    element.disabled = disabled;
  });
}

function restoreSelectedTankState() {
  if (isTotalSelected()) {
    setCalculationFieldsDisabled(true);
    renderTotalSummary();
    setError("");
    return;
  }

  const tank = selectedTank();
  if (!tank) return;

  setCalculationFieldsDisabled(false);
  isRestoringState = true;
  const states = loadStoredStates();
  const state = states[tank.id] || defaultStateForTank(tank);
  applyInputState(state.input);
  renderResult(state.result || emptyResult());
  setError("");
  isRestoringState = false;
}

function updateRangeHelp() {
  if (isTotalSelected()) {
    rangeHelp.textContent = "저장된 탱크 계산값을 유종별로 합산합니다.";
    return;
  }

  const tank = selectedTank();
  if (!tank) return;
  rangeHelp.textContent =
    `Oil: ${tank.oil_type} | Sounding: 0~${tank.max_sound_cm} cm | ` +
    `Trim: ${tank.trim_min}~${tank.trim_max} m | Heel: -5~+5 deg | ` +
    `Temp ref: ${tank.reference_temp_c} C`;
}

async function loadTanks() {
  const response = await fetch("data/tanks.json");
  if (!response.ok) throw new Error("탱크 데이터를 불러오지 못했습니다.");
  tankData = await response.json();
  tanks = window.SoundingCalculator.listTanks(tankData);
  tankSelect.innerHTML =
    tanks
      .map((tank) => {
        const oilClass = isMgoTank(tank) ? "mgo-option" : "hfo-option";
        return `<option class="${oilClass}" value="${tank.id}">${tank.name}</option>`;
      })
      .join("") +
    `<option class="total-option" value="${TOTAL_TANK_ID}">${TOTAL_TANK_LABEL}</option>`;
  if (tanks[0]) restoreSelectedTankState();
  updateTankSelectStyle();
  updateRangeHelp();
}

function calculate(payload) {
  return window.SoundingCalculator.calculate(tankData, payload);
}

function renderResult(result) {
  totalSummary.hidden = true;
  currentTotalReport = null;
  correctedVolumeResult.textContent = formatNumber(result.corrected_volume_m3);
  volumeResult.textContent = `${formatNumber(result.volume_m3)} m3`;
  weightResult.textContent = formatNumber(result.metric_ton);
  temperatureVcf.textContent = formatNumber(result.temperature_vcf, 6);
  rawSound.textContent = `${formatNumber(result.raw_sound_cm)} cm`;
  heelCorrection.textContent = `${formatNumber(result.heel_correction_cm)} cm`;
  correctedSound.textContent = `${formatNumber(result.corrected_sound_cm)} cm`;
}

function oilGroup(oilType) {
  return oilType === "LSMGO" || oilType === "MGO" ? "MGO" : "HFO";
}

function renderTotalSummary() {
  const states = loadStoredStates();
  const rows = tanks.map((tank) => {
    const state = states[tank.id];
    const result = state?.result;
    return {
      tank,
      input: state?.input || defaultStateForTank(tank).input,
      result: result && result.corrected_volume_m3 !== null ? result : null
    };
  });

  const calculatedRows = rows.filter((row) => row.result);
  const totals = calculatedRows.reduce((acc, row) => {
    const group = oilGroup(row.tank.oil_type);
    acc[group] ||= { volume: 0, weight: 0 };
    acc[group].volume += Number(row.result.corrected_volume_m3 || 0);
    acc[group].weight += Number(row.result.metric_ton || 0);
    return acc;
  }, {});

  currentTotalReport = {
    generatedAt: new Date().toLocaleString("ko-KR"),
    totals: {
      HFO: totals.HFO || { volume: 0, weight: 0 },
      MGO: totals.MGO || { volume: 0, weight: 0 }
    },
    rows: rows.map((row) => ({
      tankName: row.tank.name,
      oilType: row.tank.oil_type,
      oilGroup: oilGroup(row.tank.oil_type),
      density: row.input.density,
      volumeM3: row.result?.corrected_volume_m3 ?? null,
      weightMt: row.result?.metric_ton ?? null,
      temperatureC: row.input.temperature_c
    }))
  };

  correctedVolumeResult.textContent = formatNumber(
    calculatedRows.reduce((sum, row) => sum + Number(row.result.corrected_volume_m3 || 0), 0)
  );
  weightResult.textContent = formatNumber(
    calculatedRows.reduce((sum, row) => sum + Number(row.result.metric_ton || 0), 0)
  );
  volumeResult.textContent = `${formatNumber(
    calculatedRows.reduce((sum, row) => sum + Number(row.result.volume_m3 || 0), 0)
  )} m3`;
  temperatureVcf.textContent = "-";
  rawSound.textContent = "-";
  heelCorrection.textContent = "-";
  correctedSound.textContent = "-";

  const groupRows = ["HFO", "MGO"]
    .map((group) => {
      const total = totals[group] || { volume: 0, weight: 0 };
      return `
        <tr>
          <th>${group}</th>
          <td>${formatNumber(total.volume)}</td>
          <td>${formatNumber(total.weight)}</td>
        </tr>
      `;
    })
    .join("");

  const detailRows = rows
    .map((row) => {
      const result = row.result;
      return `
        <tr>
          <td>${row.tank.name}</td>
          <td class="${isMgoTank(row.tank) ? "oil-mgo" : "oil-hfo"}">${oilGroup(row.tank.oil_type)}</td>
          <td>${formatNumber(row.input.density)}</td>
          <td>${formatNumber(result?.corrected_volume_m3)}</td>
          <td>${formatNumber(result?.metric_ton)}</td>
          <td>${formatNumber(row.input.temperature_c, 1)}</td>
        </tr>
      `;
    })
    .join("");

  totalSummary.innerHTML = `
    <div class="total-actions">
      <button id="exportExcelButton" class="secondary-button" type="button">Excel Export</button>
      <span id="exportStatus" class="export-status"></span>
    </div>
    <section>
      <h2>Oil Totals</h2>
      <table>
        <thead>
          <tr><th>Oil</th><th>m3</th><th>M/T</th></tr>
        </thead>
        <tbody>${groupRows}</tbody>
      </table>
    </section>
    <section>
      <h2>Tank Details</h2>
      <table>
        <thead>
          <tr><th>Tank</th><th>Oil</th><th>Density</th><th>m3</th><th>M/T</th><th>Temp C</th></tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>
    </section>
  `;
  totalSummary.hidden = false;
  document.querySelector("#exportExcelButton")?.addEventListener("click", exportCurrentTotalReport);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numberCell(value) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) {
    return '<Cell><Data ss:Type="String"></Data></Cell>';
  }
  return `<Cell><Data ss:Type="Number">${Number(value)}</Data></Cell>`;
}

function textCell(value, style = "") {
  const styleAttr = style ? ` ss:StyleID="${style}"` : "";
  return `<Cell${styleAttr}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function buildExcelXml(report) {
  const totals = report.totals || {};
  const rows = report.rows || [];
  const generatedAt = report.generatedAt || new Date().toLocaleString();
  const totalRows = ["HFO", "MGO"].map((oil) => {
    const total = totals[oil] || { volume: 0, weight: 0 };
    return `<Row>${textCell(oil, "Bold")}${numberCell(total.volume)}${numberCell(total.weight)}</Row>`;
  }).join("");
  const detailRows = rows.map((row) => `
    <Row>
      ${textCell(row.tankName)}
      ${textCell(row.oilType, row.oilGroup === "MGO" ? "Mgo" : "Bold")}
      ${numberCell(row.density)}
      ${numberCell(row.volumeM3)}
      ${numberCell(row.weightMt)}
      ${numberCell(row.temperatureC)}
    </Row>
  `).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16"/><Alignment ss:Horizontal="Left"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E8EEF5" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
    <Style ss:ID="Bold"><Font ss:Bold="1"/></Style>
    <Style ss:ID="Mgo"><Font ss:Bold="1" ss:Color="#1264C7"/></Style>
  </Styles>
  <Worksheet ss:Name="Bunker Total">
    <Table>
      <Column ss:Width="180"/>
      <Column ss:Width="90"/>
      <Column ss:Width="90"/>
      <Column ss:Width="95"/>
      <Column ss:Width="95"/>
      <Column ss:Width="90"/>
      <Row>${textCell(APP_NAME, "Title")}</Row>
      <Row>${textCell(`Created by: ${APP_AUTHOR}`)}</Row>
      <Row>${textCell(`Generated: ${generatedAt}`)}</Row>
      <Row></Row>
      <Row>${textCell("Oil Totals", "Title")}</Row>
      <Row>${textCell("Oil", "Header")}${textCell("m3", "Header")}${textCell("M/T", "Header")}</Row>
      ${totalRows}
      <Row></Row>
      <Row>${textCell("Tank Details", "Title")}</Row>
      <Row>${textCell("Tank", "Header")}${textCell("Oil", "Header")}${textCell("Density", "Header")}${textCell("m3", "Header")}${textCell("M/T", "Header")}${textCell("Temp C", "Header")}</Row>
      ${detailRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

function downloadReportInBrowser(fileName, xml) {
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function shareReportInCapacitor(fileName, xml) {
  const plugins = window.Capacitor?.Plugins;
  const filesystem = plugins?.Filesystem;
  const share = plugins?.Share;

  if (!filesystem || !share) return false;

  const writeResult = await filesystem.writeFile({
    path: fileName,
    data: xml,
    directory: "CACHE",
    encoding: "utf8"
  });

  await share.share({
    title: APP_NAME,
    text: "SM PUMA bunker total Excel report",
    files: [writeResult.uri],
    dialogTitle: "Excel report export"
  });

  return true;
}

async function exportCurrentTotalReport() {
  const status = document.querySelector("#exportStatus");
  if (!currentTotalReport) {
    if (status) status.textContent = "No total data.";
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const xml = `\ufeff${buildExcelXml(currentTotalReport)}`;
  const fileName = `SM_PUMA_Bunker_Total_${stamp}.xls`;

  if (status) status.textContent = "Preparing...";
  try {
    const shared = await shareReportInCapacitor(fileName, xml);
    if (!shared) downloadReportInBrowser(fileName, xml);
    if (status) status.textContent = shared ? "Share opened." : "Saved.";
  } catch (error) {
    if (status) status.textContent = `Failed: ${error.message}`;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  setError("");

  if (isTotalSelected()) {
    renderTotalSummary();
    return;
  }

  const payload = {
    tank_id: tankSelect.value,
    ...currentInputState()
  };
  saveCurrentTankState();

  try {
    const result = calculate(payload);
    renderResult(result);
    saveCurrentTankState(result);
  } catch (error) {
    setError(error.message);
  }
});

function handleFieldEdit(event) {
  if (event.target === tankSelect || isTotalSelected()) return;
  saveCurrentTankState(null);
  renderResult(emptyResult());
}

form.addEventListener("input", handleFieldEdit);
form.addEventListener("change", handleFieldEdit);

document.querySelectorAll(".sign-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(`#${button.dataset.target}`);
    if (!input) return;
    const value = Number(input.value || 0);
    input.value = String(value === 0 ? 0 : -value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

tankSelect.addEventListener("change", () => {
  updateRangeHelp();
  restoreSelectedTankState();
  updateTankSelectStyle();
});

loadTanks()
  .then(() => {
    apiStatus.textContent = "오프라인 준비됨";
    apiStatus.classList.add("ready");
  })
  .catch((error) => {
    apiStatus.textContent = "데이터 오류";
    setError(error.message);
  });
