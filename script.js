"use strict";

const PASSWORD_HASH = "f0dc8b78f55d34c142bbec9a6b0f590e86957e58ce52464a809eaafe32517e55";
const DIVISIONS = ["동부", "중부", "서부"];
const DIVISION_MAP = { "동부영업부": "동부", "중부영업부": "중부", "서부영업부": "서부" };
const OFFICE_CODES = new Set(["A1210", "A1220", "A1230", "A1310", "A1320", "A1332", "A1340", "A1250"]);
const OFFICE_META = {
  A1210: { division: "동부", office: "부산" }, A1220: { division: "동부", office: "울산" }, A1230: { division: "동부", office: "포항" },
  A1332: { division: "중부", office: "광주" }, A1340: { division: "중부", office: "천안" }, A1250: { division: "중부", office: "충주" },
  A1320: { division: "서부", office: "수원" }, A1310: { division: "서부", office: "인천" }
};
const COLORS = ["#2d6cdf", "#36a9c9", "#16856c", "#e8892e", "#7568d6", "#d84a58", "#6b7d91", "#91a846"];

const state = {
  data: null,
  importedData: null,
  report: "weekly",
  period: "",
  division: "전체",
  office: "전체",
  charts: {}
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const safeRate = (value, base) => base ? value / base : null;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const number = (value, digits = 0) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits }).format(Number(value || 0));
const moneyMillion = (value, digits = 0) => number(Number(value || 0) / 1_000_000, digits);
const moneyBillion = (value, digits = 1) => number(Number(value || 0) / 100_000_000, digits);
const percent = (value, digits = 1) => value == null || !Number.isFinite(value) ? "-" : `${number(value * 100, digits)}%`;
const periodLabel = (period, report) => {
  if (report !== "weekly") return period.replace(/^(\d{4})-(\d{2})$/, "$1년 $2월");
  const asOf = state.data?.weekly?.find((item) => item.period === period)?.asOf;
  const match = String(asOf || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return period.replace(/^(\d{4})-W(\d{2})$/, "$1년 $2주차");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const mondayOffset = (firstDay + 6) % 7;
  const weekOfMonth = Math.ceil((day + mondayOffset) / 7);
  return `${match[1]}년 ${Number(match[2])}월 ${weekOfMonth}주차`;
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  if (sessionStorage.getItem("bwc_dashboard_access") === "granted") showApp();
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#logoutButton").addEventListener("click", logout);
  $$(".report-tab").forEach((button) => button.addEventListener("click", () => switchReport(button.dataset.report)));
  $("#periodSelect").addEventListener("change", (event) => { state.period = event.target.value; render(); });
  $("#openImportButton").addEventListener("click", () => $("#importDialog").showModal());
  $("#convertButton").addEventListener("click", convertExcelFiles);
  $("#downloadButton").addEventListener("click", downloadImportedData);
}

async function handleLogin(event) {
  event.preventDefault();
  const hash = await sha256($("#passwordInput").value);
  if (hash !== PASSWORD_HASH) {
    $("#loginMessage").textContent = "비밀번호가 일치하지 않습니다.";
    return;
  }
  sessionStorage.setItem("bwc_dashboard_access", "granted");
  $("#loginMessage").textContent = "";
  showApp();
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function showApp() {
  $("#loginView").classList.add("is-hidden");
  $("#app").classList.remove("is-hidden");
  if (!state.data) {
    try {
      const response = await fetch(`data.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`data.json 로드 실패 (${response.status})`);
      state.data = await response.json();
      validateData(state.data);
      initializeFilters();
      render();
    } catch (error) {
      showNotice(`${error.message}. README의 로컬 실행 방법을 확인하세요.`);
    }
  }
}

function logout() {
  sessionStorage.removeItem("bwc_dashboard_access");
  location.reload();
}

function validateData(data) {
  if (!data || !Array.isArray(data.weekly) || !Array.isArray(data.monthly)) throw new Error("data.json 구조가 올바르지 않습니다");
}

function initializeFilters() {
  $("#updatedAt").textContent = state.data.meta?.updatedAt || "-";
  renderDivisionButtons();
  refreshPeriodSelect();
  refreshOfficeButtons();
}

function switchReport(report) {
  state.report = report;
  state.period = "";
  $$(".report-tab").forEach((button) => button.classList.toggle("active", button.dataset.report === report));
  $("#weeklyView").classList.toggle("is-hidden", report !== "weekly");
  $("#monthlyView").classList.toggle("is-hidden", report !== "monthly");
  refreshPeriodSelect();
  render();
}

function refreshPeriodSelect() {
  const source = state.report === "weekly" ? state.data.weekly : state.data.monthly;
  const periods = source.map((item) => item.period).sort().reverse();
  state.period = periods.includes(state.period) ? state.period : periods[0] || "";
  $("#periodSelect").innerHTML = periods.map((period) => `<option value="${period}">${periodLabel(period, state.report)}</option>`).join("");
  $("#periodSelect").value = state.period;
}

function renderDivisionButtons() {
  const values = ["전체", ...DIVISIONS];
  $("#divisionButtons").innerHTML = values.map((value) => `<button type="button" class="filter-choice${state.division === value ? " active" : ""}" data-division="${value}" aria-pressed="${state.division === value}">${value === "전체" ? "전체" : value}</button>`).join("");
  $$("#divisionButtons .filter-choice").forEach((button) => button.addEventListener("click", () => {
    state.division = button.dataset.division;
    state.office = "전체";
    renderDivisionButtons();
    refreshOfficeButtons();
    render();
  }));
}

function refreshOfficeButtons() {
  // 영업소 버튼은 현재 조직 기준(OFFICE_META)을 사용합니다.
  // 과거 데이터에 다른 본부 소속 이력이 있어도 현재 본부 필터에는 섞이지 않습니다.
  const offices = Object.values(OFFICE_META)
    .filter((item) => state.division === "전체" || item.division === state.division)
    .map((item) => item.office)
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, "ko"));
  if (!offices.includes(state.office)) state.office = "전체";
  $("#officeButtons").innerHTML = ["전체", ...offices].map((value) => `<button type="button" class="filter-choice${state.office === value ? " active" : ""}" data-office="${value}" aria-pressed="${state.office === value}">${value === "전체" ? "전체" : value}</button>`).join("");
  $$("#officeButtons .filter-choice").forEach((button) => button.addEventListener("click", () => {
    state.office = button.dataset.office;
    refreshOfficeButtons();
    render();
  }));
}

function filteredRecords() {
  const source = state.report === "weekly" ? state.data.weekly : state.data.monthly;
  const periodData = source.find((item) => item.period === state.period);
  return (periodData?.records || []).filter((row) =>
    (state.division === "전체" || row.division === state.division) &&
    (state.office === "전체" || row.office === state.office)
  );
}

function filteredSupplementalPeriod(key, useLatestFallback = false) {
  const periods = state.data[key] || [];
  let periodData = periods.find((item) => item.period === state.period);
  if (!periodData && useLatestFallback) periodData = [...periods].sort((a, b) => b.period.localeCompare(a.period))[0];
  const records = (periodData?.records || []).filter((row) =>
    (state.division === "전체" || row.division === state.division) &&
    (state.office === "전체" || row.office === state.office)
  );
  return { period: periodData?.period || null, records };
}

function filteredSupplementalRecords(key) {
  return filteredSupplementalPeriod(key).records;
}

function render() {
  if (!state.data) return;
  $("#reportLabel").textContent = state.report === "weekly" ? "주간보고" : "월간보고";
  $("#selectionLabel").textContent = `${state.division === "전체" ? "전체 본부" : `${state.division} 본부`} · ${state.office === "전체" ? "전체 영업소" : `${state.office} 영업소`}`;
  hideNotice();
  const rows = filteredRecords();
  if (state.report === "weekly") renderWeekly(rows);
  else renderMonthly(rows);
}

function renderWeekly(rows) {
  $("#kpiGrid").classList.remove("monthly-eight");
  const drum = rows.filter((row) => row.packageUnit === "DRUM");
  const revenue = sum(rows, "revenue");
  const planRevenue = sum(rows, "planRevenue");
  const priorRevenue = sum(rows, "priorRevenue");
  const ytdRevenue = sum(rows, "ytdRevenue");
  const ytdPriorRevenue = sum(rows, "ytdPriorRevenue");
  const cards = [
    { title: "주간 수량", value: `${number(sum(drum, "quantity"), 1)} DRUM`, meta: `계획 대비 ${percent(safeRate(sum(drum, "quantity"), sum(drum, "planQuantity")))}`, accent: "#2d6cdf" },
    { title: "DM 전년 동기비", value: percent(safeRate(sum(drum, "quantity"), sum(drum, "priorQuantity"))), meta: `전년 ${number(sum(drum, "priorQuantity"), 1)} DRUM`, accent: "#36a9c9" },
    { title: "주간 매출", value: `${moneyBillion(revenue)}억원`, meta: `${moneyMillion(revenue)}백만원`, accent: "#16856c" },
    { title: "매출 달성률", value: percent(safeRate(revenue, planRevenue)), meta: `계획 ${moneyBillion(planRevenue)}억원`, accent: "#7568d6" },
    { title: "전년 동기비", value: percent(safeRate(revenue, priorRevenue)), meta: differenceLabel(revenue, priorRevenue), accent: "#e8892e" },
    { title: "누계 매출", value: `${moneyBillion(ytdRevenue)}억원`, meta: `전년 동기비 ${percent(safeRate(ytdRevenue, ytdPriorRevenue))}`, accent: "#0c2240" }
  ];
  renderKpis(cards);

  const officeRows = aggregate(rows, ["division", "office"], ["quantity", "revenue", "planRevenue", "priorRevenue", "ytdRevenue"], "packageUnit");
  renderWeeklyQuantityChart(officeRows);
  renderWeeklyShareChart(rows);
  renderWeeklyTable(officeRows);
}

function renderMonthly(rows) {
  $("#kpiGrid").classList.add("monthly-eight");
  const revenue = sum(rows, "revenue");
  const planRevenue = sum(rows, "planRevenue");
  const priorRevenue = sum(rows, "priorRevenue");
  const ytdRevenue = sum(rows, "ytdRevenue");
  const ytdPriorRevenue = sum(rows, "ytdPriorRevenue");
  const drumQuantity = sum(rows, "quantityDrum");
  const priorDrumQuantity = sum(rows, "priorQuantityDrum");
  const operatingProfit = sum(rows, "operatingProfit");
  const cards = [
    { title: "월간 수량", value: `${number(drumQuantity, 1)} DRUM`, meta: `계획 대비 ${percent(safeRate(drumQuantity, sum(rows, "planQuantityDrum")))}`, accent: "#2d6cdf" },
    { title: "DM 전년 동기비", value: percent(safeRate(drumQuantity, priorDrumQuantity)), meta: `전년 ${number(priorDrumQuantity, 1)} DRUM`, accent: "#36a9c9" },
    { title: "월간 매출", value: `${moneyBillion(revenue)}억원`, meta: `${moneyMillion(revenue)}백만원`, accent: "#16856c" },
    { title: "매출 달성률", value: percent(safeRate(revenue, planRevenue)), meta: `계획 ${moneyBillion(planRevenue)}억원`, accent: "#7568d6" },
    { title: "전년 동기비", value: percent(safeRate(revenue, priorRevenue)), meta: differenceLabel(revenue, priorRevenue), accent: "#e8892e" },
    { title: "누계 매출", value: `${moneyBillion(ytdRevenue)}억원`, meta: `전년 동기비 ${percent(safeRate(ytdRevenue, ytdPriorRevenue))}`, accent: "#0c2240" },
    { title: "영업이익", value: `${moneyBillion(operatingProfit)}억원`, meta: operatingProfit >= 0 ? "흑자" : "적자", accent: operatingProfit >= 0 ? "#e8892e" : "#d84a58" },
    { title: "영업이익률", value: percent(safeRate(operatingProfit, revenue)), meta: "영업이익 ÷ 매출", accent: "#172f55" }
  ];
  renderKpis(cards);

  const productData = filteredSupplementalPeriod("productProfit", true);
  const productRows = productData.records;
  const receivableRows = filteredSupplementalRecords("receivables");
  const productPeriodLabel = productData.period ? `${Number(productData.period.slice(5))}월 자료` : "영업이익률";
  $("#productPeriodBadge").textContent = productPeriodLabel;
  $("#productDetailBadge").textContent = productData.period ? `금액: 백만원 · ${productPeriodLabel}` : "금액: 백만원";
  if (state.division !== "전체" || state.office !== "전체") showNotice("월별 추이 차트는 BWC 전체 집계입니다. 영업소 선택은 나머지 월간 지표에 적용됩니다.");
  if (!productRows.length) showNotice("선택한 월의 유종별 이익분석 자료가 없습니다. Excel 업데이트에서 같은 월의 유종별 파일을 추가해 주세요.");
  else if (productData.period !== state.period) showNotice(`유종별 이익률은 별도 업로드한 ${productData.period.slice(0, 4)}년 ${Number(productData.period.slice(5))}월 최신 자료입니다.`);
  if (!receivableRows.length) showNotice("선택한 월의 영업소별 미수 자료가 없습니다. 월간 Excel의 ‘영업소_미수’ 시트를 확인해 주세요.");

  renderMonthlyTrendChart();
  renderOfficeMarginChart(rows);
  renderReceivables(receivableRows);
  renderProductViews(productRows);
  renderMonthlyTable(rows);
}

function renderKpis(cards) {
  $("#kpiGrid").innerHTML = cards.map((card) => `
    <article class="kpi-card" style="--accent:${card.accent}">
      <div class="kpi-title">${escapeHtml(card.title)}</div>
      <div class="kpi-value">${escapeHtml(card.value)}</div>
      <div class="kpi-meta">${escapeHtml(card.meta)}</div>
    </article>`).join("");
}

function differenceLabel(current, previous) {
  if (!previous) return "비교값 없음";
  const change = (current - previous) / previous;
  return `${change >= 0 ? "+" : ""}${percent(change)} vs 전년`;
}

function aggregate(rows, keys, metrics, unitKey = null) {
  const map = new Map();
  rows.forEach((row) => {
    const id = keys.map((key) => row[key]).join("||");
    if (!map.has(id)) map.set(id, Object.fromEntries(keys.map((key) => [key, row[key]])));
    const target = map.get(id);
    metrics.forEach((metric) => {
      const outputKey = unitKey ? `${metric}${row[unitKey] === "EA" ? "Ea" : "Drum"}` : metric;
      target[outputKey] = Number(target[outputKey] || 0) + Number(row[metric] || 0);
    });
  });
  return [...map.values()];
}

function replaceChart(id, config) {
  if (state.charts[id]) state.charts[id].destroy();
  const context = document.getElementById(id);
  if (!context || typeof Chart === "undefined") return;
  state.charts[id] = new Chart(context, config);
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, font: { family: "Noto Sans KR", size: 10 } } }, tooltip: { padding: 11 } },
    scales: { x: { grid: { display: false }, ticks: { color: "#6f7d91", font: { size: 10 } } }, y: { beginAtZero: true, grid: { color: "#edf1f6" }, ticks: { color: "#6f7d91", font: { size: 10 } } } }
  };
}

function renderWeeklyQuantityChart(rows) {
  replaceChart("weeklyQuantityChart", {
    type: "bar",
    data: {
      labels: rows.map((row) => row.office),
      datasets: [
        { label: "DRUM", data: rows.map((row) => row.quantityDrum || 0), backgroundColor: "#2d6cdf", borderRadius: 5, yAxisID: "y" },
        { label: "EA", data: rows.map((row) => row.quantityEa || 0), backgroundColor: "#36a9c9", borderRadius: 5, yAxisID: "y1" }
      ]
    },
    options: { ...baseChartOptions(), scales: { ...baseChartOptions().scales, y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, ticks: { color: "#6f7d91", font: { size: 10 } } } } }
  });
}

function renderWeeklyShareChart(rows) {
  // 전체 조회 시에는 본부별, 특정 본부 조회 시에는 해당 본부 산하 영업소별 매출 비중을 표시합니다.
  const groupKey = state.division === "전체" ? "division" : "office";
  const groups = aggregate(rows, [groupKey], ["revenue"])
    .filter((row) => Number(row.revenue || 0) !== 0)
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
  const totalRevenue = sum(groups, "revenue");
  const title = document.getElementById("weeklyShareTitle");
  if (title) title.textContent = state.division === "전체" ? "본부별 매출 비중" : "영업소별 매출 비중";

  replaceChart("weeklyShareChart", {
    type: "doughnut",
    data: {
      labels: groups.map((row) => row[groupKey]),
      datasets: [{ data: groups.map((row) => row.revenue), backgroundColor: COLORS, borderWidth: 3, borderColor: "#fff" }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "66%",
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, font: { family: "Noto Sans KR", size: 10 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const share = safeRate(Number(ctx.raw || 0), totalRevenue);
              return `${ctx.label}: ${moneyMillion(ctx.raw)}백만원 (${percent(share)})`;
            }
          }
        }
      }
    }
  });
}

function renderWeeklyTable(rows) {
  const body = rows.sort((a, b) => (b.revenueDrum + b.revenueEa) - (a.revenueDrum + a.revenueEa)).map((row) => {
    const revenue = (row.revenueDrum || 0) + (row.revenueEa || 0);
    const plan = (row.planRevenueDrum || 0) + (row.planRevenueEa || 0);
    const prior = (row.priorRevenueDrum || 0) + (row.priorRevenueEa || 0);
    return `<tr><td>${escapeHtml(row.division)}</td><td>${escapeHtml(row.office)}</td><td>${number(row.quantityDrum, 1)}</td><td>${number(row.quantityEa)}</td><td>${moneyMillion(revenue, 1)}</td><td>${percent(safeRate(revenue, plan))}</td><td>${percent(safeRate(revenue, prior))}</td><td>${moneyMillion((row.ytdRevenueDrum || 0) + (row.ytdRevenueEa || 0), 1)}</td></tr>`;
  }).join("");
  $("#weeklyTable").innerHTML = `<thead><tr><th>본부</th><th>영업소</th><th>DRUM</th><th>EA</th><th>매출</th><th>계획 달성률</th><th>전년 동기비</th><th>누계 매출</th></tr></thead><tbody>${body || emptyRow(8)}</tbody>`;
}

function renderMonthlyTrendChart() {
  const rows = state.data.monthlyTrend || [];
  replaceChart("monthlyTrendChart", {
    type: "bar",
    data: {
      labels: rows.map((row) => row.period.slice(5) + "월"),
      datasets: [
        { label: "매출(억원)", data: rows.map((row) => row.revenue / 100_000_000), backgroundColor: "rgba(45,108,223,.78)", borderRadius: 5, yAxisID: "y" },
        { type: "line", label: "영업이익률", data: rows.map((row) => (row.operatingMargin || 0) * 100), borderColor: "#e8892e", backgroundColor: "#e8892e", pointRadius: 3, tension: .32, yAxisID: "y1" }
      ]
    },
    options: { ...baseChartOptions(), scales: { ...baseChartOptions().scales, y1: { position: "right", grid: { drawOnChartArea: false }, ticks: { callback: (value) => `${value}%`, color: "#6f7d91", font: { size: 10 } } } } }
  });
}

function renderOfficeMarginChart(rows) {
  const groups = aggregate(rows, ["office"], ["revenue", "operatingProfit"]);
  groups.forEach((row) => row.margin = safeRate(row.operatingProfit, row.revenue));
  groups.sort((a, b) => (b.margin || 0) - (a.margin || 0));
  replaceChart("officeMarginChart", {
    type: "bar",
    data: { labels: groups.map((row) => row.office), datasets: [{ label: "영업이익률", data: groups.map((row) => (row.margin || 0) * 100), backgroundColor: groups.map((row) => row.margin >= 0 ? "#16856c" : "#d84a58"), borderRadius: 5 }] },
    options: { ...baseChartOptions(), indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${number(ctx.raw, 1)}%` } } }, scales: { x: { grid: { color: "#edf1f6" }, ticks: { callback: (value) => `${value}%` } }, y: { grid: { display: false } } } }
  });
}

function renderReceivables(rows) {
  const groups = aggregate(rows, ["division", "office"], ["totalReceivable", "currentReceivable", "under3Months", "over3Months"])
    .sort((a, b) => b.totalReceivable - a.totalReceivable);
  replaceChart("receivableChart", {
    type: "bar",
    data: {
      labels: groups.map((row) => row.office),
      datasets: [
        { label: "총 미수", data: groups.map((row) => row.totalReceivable / 1_000_000), backgroundColor: "#2d6cdf", borderRadius: 5 },
        { label: "3개월 이상", data: groups.map((row) => row.over3Months / 1_000_000), backgroundColor: "#e8892e", borderRadius: 5 }
      ]
    },
    options: { ...baseChartOptions(), scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: "#edf1f6" }, ticks: { color: "#6f7d91" } } } }
  });
  const body = groups.map((row) => `<tr><td>${escapeHtml(row.division)}</td><td>${escapeHtml(row.office)}</td><td>${moneyMillion(row.totalReceivable, 1)}</td><td>${moneyMillion(row.currentReceivable, 1)}</td><td>${moneyMillion(row.under3Months, 1)}</td><td>${moneyMillion(row.over3Months, 1)}</td><td class="${safeRate(row.over3Months, row.totalReceivable) > .2 ? "rate-negative" : "rate-positive"}">${percent(safeRate(row.over3Months, row.totalReceivable))}</td></tr>`).join("");
  $("#receivableTable").innerHTML = `<thead><tr><th>본부</th><th>영업소</th><th>총 미수</th><th>당월 미수</th><th>2개월 이하</th><th>3개월 이상</th><th>장기미수 비율</th></tr></thead><tbody>${body || emptyRow(7)}</tbody>`;
}

function renderProductViews(rows) {
  const normalizedRows = rows.map((row) => ({ ...row, product: normalizeProductName(row.product) }));
  const products = aggregate(normalizedRows, ["product"], ["quantityDrum", "quantityEa", "revenue", "operatingProfit"]);
  products.forEach((row) => { row.operatingMargin = safeRate(row.operatingProfit, row.revenue); });
  replaceChart("productMarginChart", {
    type: "bar",
    data: { labels: products.map((row) => row.product), datasets: [{ label: "영업이익률", data: products.map((row) => (row.operatingMargin || 0) * 100), backgroundColor: "#2d6cdf", borderRadius: 5 }] },
    options: { ...baseChartOptions(), scales: { x: { grid: { display: false } }, y: { grid: { color: "#edf1f6" }, ticks: { callback: (value) => `${value}%` } } } }
  });
  const body = products.map((row) => `<tr><td>${escapeHtml(row.product)}</td><td>${number(row.quantityDrum, 1)}</td><td>${number(row.quantityEa)}</td><td>${moneyMillion(row.revenue, 1)}</td><td>${moneyMillion(row.operatingProfit, 1)}</td><td class="${row.operatingMargin < 0 ? "rate-negative" : "rate-positive"}">${percent(row.operatingMargin)}</td></tr>`).join("");
  $("#productTable").innerHTML = `<thead><tr><th>유종</th><th>DRUM</th><th>EA</th><th>매출</th><th>영업이익</th><th>영업이익률</th></tr></thead><tbody>${body || emptyRow(6)}</tbody>`;
}

function renderMonthlyTable(rows) {
  const monthlyMetrics = ["quantityDrum", "quantityEa", "revenue", "planRevenue", "priorRevenue", "ytdRevenue", "operatingProfit"];
  const groups = aggregate(rows, ["division", "office"], monthlyMetrics);
  const visibleDivisions = DIVISIONS.filter((division) => groups.some((row) => row.division === division));
  const body = visibleDivisions.map((division) => {
    const offices = groups.filter((row) => row.division === division).sort((a, b) => b.revenue - a.revenue);
    const total = aggregate(offices, ["division"], monthlyMetrics)[0];
    const totalRow = state.office === "전체" && total ? monthlyResultRow(total, `${division} 합계`, true) : "";
    return totalRow + offices.map((row) => monthlyResultRow(row, row.office, false)).join("");
  }).join("");
  $("#monthlyTable").innerHTML = `<thead><tr><th>본부</th><th>영업소</th><th>DRUM</th><th>EA</th><th>매출</th><th>계획 달성률</th><th>전년 동기비</th><th>누계 매출</th><th>영업이익</th><th>영업이익률</th></tr></thead><tbody>${body || emptyRow(10)}</tbody>`;
}

function monthlyResultRow(row, label, isSubtotal) {
  return `<tr class="${isSubtotal ? "subtotal-row" : "office-row"}"><td>${escapeHtml(row.division)}</td><td>${escapeHtml(label)}</td><td>${number(row.quantityDrum, 1)}</td><td>${number(row.quantityEa)}</td><td>${moneyMillion(row.revenue, 1)}</td><td>${percent(safeRate(row.revenue, row.planRevenue))}</td><td>${percent(safeRate(row.revenue, row.priorRevenue))}</td><td>${moneyMillion(row.ytdRevenue, 1)}</td><td>${moneyMillion(row.operatingProfit, 1)}</td><td class="${row.operatingProfit < 0 ? "rate-negative" : "rate-positive"}">${percent(safeRate(row.operatingProfit, row.revenue))}</td></tr>`;
}

function emptyRow(columns) { return `<tr><td colspan="${columns}" class="empty-cell">선택 조건에 해당하는 데이터가 없습니다.</td></tr>`; }
function showNotice(message) { const node = $("#dataNotice"); node.textContent = node.textContent ? `${node.textContent} ${message}` : message; node.classList.remove("is-hidden"); }
function hideNotice() { $("#dataNotice").textContent = ""; $("#dataNotice").classList.add("is-hidden"); }

async function readWorkbook(file) {
  if (typeof XLSX === "undefined") throw new Error("Excel 변환 라이브러리를 불러오지 못했습니다.");
  return XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
}

async function convertExcelFiles() {
  const weeklyFile = $("#weeklyFile").files[0];
  const monthlyFile = $("#monthlyFile").files[0];
  const productFile = $("#productFile").files[0];
  if (!weeklyFile && !monthlyFile && !productFile) return setImportStatus("주간, 월간 또는 유종별 이익분석 Excel을 선택해 주세요.", "error");
  try {
    setImportStatus("Excel 구조를 확인하고 있습니다.");
    const next = JSON.parse(JSON.stringify(state.data));
    let importedWeeklyCount = 0;
    let importedMonthlyCount = 0;
    let importedReceivableCount = 0;
    let importedProductCount = 0;
    if (weeklyFile) {
      const weeklyPeriod = parseWeeklyWorkbook(await readWorkbook(weeklyFile));
      next.weekly = mergePeriods(next.weekly || [], [weeklyPeriod]);
      importedWeeklyCount = 1;
    }
    if (monthlyFile) {
      const parsed = parseMonthlyWorkbook(await readWorkbook(monthlyFile));
      next.monthly = mergePeriods(next.monthly || [], parsed.monthlyPeriods);
      next.monthlyTrend = mergePeriods(next.monthlyTrend || [], parsed.trends);
      next.receivables = mergePeriods(next.receivables || [], parsed.receivables);
      importedMonthlyCount = parsed.monthlyPeriods.length;
      importedReceivableCount = parsed.receivables.length;
    }
    if (productFile) {
      const productPeriod = parseProductWorkbook(await readWorkbook(productFile), productFile.name, next);
      next.productProfit = mergePeriods(next.productProfit || [], [productPeriod]);
      importedProductCount = 1;
    }
    next.organization = buildOrganization(next);
    next.meta.updatedAt = new Date().toISOString().slice(0, 10);
    state.importedData = next;
    state.data = next;
    state.division = "전체";
    state.office = "전체";
    initializeFilters();
    render();
    $("#downloadButton").disabled = false;
    const summary = [
      importedWeeklyCount ? `주간 ${importedWeeklyCount}개` : "",
      importedMonthlyCount ? `월간 ${importedMonthlyCount}개월` : "",
      importedReceivableCount ? `미수 ${importedReceivableCount}개월` : "",
      importedProductCount ? `유종별 ${importedProductCount}개월` : ""
    ].filter(Boolean).join(", ");
    setImportStatus(`${summary} 데이터를 기존 이력과 병합했습니다. 화면을 확인한 뒤 data.json을 내려받으세요.`, "success");
  } catch (error) {
    console.error(error);
    setImportStatus(error.message || "변환 중 오류가 발생했습니다.", "error");
  }
}

function parseWeeklyWorkbook(workbook) {
  const sheet = workbook.Sheets["주 마감"];
  if (!sheet) throw new Error("주간 Excel에서 ‘주 마감’ 시트를 찾지 못했습니다.");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const records = [];
  rows.slice(8).forEach((row) => {
    const code = String(row[2] || "").trim();
    const meta = OFFICE_META[code];
    const unit = String(row[3] || "").trim();
    if (!meta || !["DRUM", "EA"].includes(unit)) return;
    records.push({
      division: meta.division, office: meta.office, officeCode: code, packageUnit: unit,
      planQuantity: numeric(row[4]), quantity: numeric(row[5]), priorQuantity: numeric(row[7]),
      planRevenue: numeric(row[9]), revenue: numeric(row[10]), priorRevenue: numeric(row[12]),
      ytdPlanQuantity: numeric(row[14]), ytdQuantity: numeric(row[15]), ytdPriorQuantity: numeric(row[17]),
      ytdPlanRevenue: numeric(row[19]), ytdRevenue: numeric(row[20]), ytdPriorRevenue: numeric(row[22])
    });
  });
  if (!records.length) throw new Error("주간 Excel에서 영업소 실적을 읽지 못했습니다.");
  const asOf = parseKoreanDate(rows[0]?.[0]) || new Date().toISOString().slice(0, 10);
  return { period: isoWeek(asOf), asOf, records };
}

function parseMonthlyWorkbook(workbook) {
  const historyPeriods = parseMonthlyHistorySheets(workbook);
  const detailedPeriod = parseMonthlyDetailSheet(workbook);
  let monthlyPeriods = historyPeriods;
  if (detailedPeriod && !monthlyPeriods.some((item) => item.period === detailedPeriod.period)) monthlyPeriods = mergePeriods(monthlyPeriods, [detailedPeriod]);
  if (!monthlyPeriods.length) throw new Error("월간 Excel에서 월별 영업소 실적을 읽지 못했습니다.");
  const trends = monthlyPeriods.map((item) => {
    const totals = {
      period: item.period,
      quantityDrum: sum(item.records, "quantityDrum"),
      quantityEa: sum(item.records, "quantityEa"),
      revenue: sum(item.records, "revenue"),
      operatingProfit: sum(item.records, "operatingProfit")
    };
    totals.operatingMargin = safeRate(totals.operatingProfit, totals.revenue);
    return roundRecord(totals);
  });
  const receivables = parseReceivablePeriods(workbook);
  return { monthlyPeriods, trends, receivables };
}

function parseReceivablePeriods(workbook) {
  const sheet = workbook.Sheets["영업소_미수"];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const monthHeaderIndex = rows.findIndex((row, index) => index > 40 && row[3] === "1월" && row[14] === "12월");
  if (monthHeaderIndex < 0) return [];
  const yearText = String(rows[monthHeaderIndex - 1]?.find((value) => /20\d{2}년/.test(String(value || ""))) || "");
  const year = yearText.match(/20\d{2}/)?.[0] || String(new Date().getFullYear());
  const periods = new Map();
  let division = null;
  let office = null;
  rows.slice(monthHeaderIndex + 1).forEach((row) => {
    if (row[0]) {
      division = DIVISION_MAP[String(row[0]).trim()] || null;
      if (!division) office = null;
    }
    if (row[1]) {
      const candidate = String(row[1]).replace("영업소", "").trim();
      office = Object.values(OFFICE_META).some((item) => item.office === candidate) ? candidate : null;
    }
    const metric = String(row[2] || "").trim();
    const field = { "소계": "totalReceivable", "당월 미수": "currentReceivable", "2개월 이하": "under3Months", "3개월 이상": "over3Months" }[metric];
    if (!division || !office || !field) return;
    const officeEntry = Object.entries(OFFICE_META).find(([, item]) => item.office === office && item.division === division);
    if (!officeEntry) return;
    for (let month = 1; month <= 12; month += 1) {
      const period = `${year}-${String(month).padStart(2, "0")}`;
      if (!periods.has(period)) periods.set(period, new Map());
      const map = periods.get(period);
      if (!map.has(office)) map.set(office, { division, office, officeCode: officeEntry[0], totalReceivable: 0, currentReceivable: 0, under3Months: 0, over3Months: 0 });
      map.get(office)[field] = numeric(row[month + 2]);
    }
  });
  return [...periods.entries()].map(([period, records]) => ({ period, records: [...records.values()].map(roundRecord) }))
    .filter((item) => item.records.some((row) => row.totalReceivable || row.currentReceivable || row.under3Months || row.over3Months))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function parseProductWorkbook(workbook, fileName, data) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("유종별 Excel에서 데이터 시트를 찾지 못했습니다.");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headers = rows[1] || [];
  const productIndex = headers.indexOf("유종대분류");
  const officeCodeIndex = headers.indexOf("부서코드");
  const officeIndex = headers.indexOf("단위부서명");
  const unitIndex = headers.indexOf("포장단위");
  const quantityIndex = headers.indexOf("실적수량");
  const revenueIndex = headers.indexOf("실적금액");
  const operatingProfitIndex = headers.indexOf("실적영업이익");
  if ([productIndex, officeCodeIndex, officeIndex, unitIndex, quantityIndex, revenueIndex, operatingProfitIndex].some((index) => index < 0)) throw new Error("유종별 Excel의 열 구성이 기존 양식과 다릅니다.");
  const groups = new Map();
  rows.slice(2).forEach((row) => {
    const officeCode = String(row[officeCodeIndex] || "").trim();
    const meta = OFFICE_META[officeCode];
    const unit = String(row[unitIndex] || "").trim();
    if (!meta || !["DRUM", "EA"].includes(unit)) return;
    const product = normalizeProductName(row[productIndex]);
    const id = `${officeCode}||${product}`;
    if (!groups.has(id)) groups.set(id, { division: meta.division, office: meta.office, officeCode, product, quantityDrum: 0, quantityEa: 0, revenue: 0, operatingProfit: 0 });
    const target = groups.get(id);
    target[unit === "DRUM" ? "quantityDrum" : "quantityEa"] += numeric(row[quantityIndex]);
    target.revenue += numeric(row[revenueIndex]);
    target.operatingProfit += numeric(row[operatingProfitIndex]);
  });
  const records = [...groups.values()].map(roundRecord).filter((row) => row.quantityDrum || row.quantityEa || row.revenue || row.operatingProfit);
  if (!records.length) throw new Error("유종별 Excel에서 8개 영업소의 실적을 읽지 못했습니다.");
  const explicitPeriod = String(fileName).match(/(20\d{2})\D*(\d{1,2})월/);
  const monthOnly = String(fileName).match(/(\d{1,2})월/);
  const latestMonthly = [...(data.monthly || [])].sort((a, b) => b.period.localeCompare(a.period))[0]?.period;
  const year = explicitPeriod?.[1] || latestMonthly?.slice(0, 4) || String(new Date().getFullYear());
  const month = Number(explicitPeriod?.[2] || monthOnly?.[1]);
  if (!month || month > 12) throw new Error("유종별 Excel 파일명에서 ‘8월’과 같은 기준월을 찾지 못했습니다.");
  return { period: `${year}-${String(month).padStart(2, "0")}`, records };
}

function normalizeProductName(value) {
  const cleaned = String(value || "유종 미분류").replace(/\s*\(\s*상\s*\)\s*$/u, "").trim().replace(/\s+/gu, " ");
  return cleaned === "산업용윤활유" ? "산업용 윤활유" : cleaned;
}

function parseMonthlyDetailSheet(workbook) {
  const sheet = workbook.Sheets["거래형태별 이익"];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headers = rows[1] || [];
  const productIndex = headers.findIndex((value) => ["유종", "제품군", "품목군"].includes(String(value || "").trim()));
  const quantityIndex = headers.indexOf("실적수량");
  const revenueIndex = headers.indexOf("실적금액");
  const grossProfitIndex = headers.indexOf("실적매출이익");
  const operatingProfitIndex = headers.indexOf("실적영업이익");
  if ([quantityIndex, revenueIndex, grossProfitIndex, operatingProfitIndex].some((index) => index < 0)) throw new Error("월간 Excel의 실적 열 구성이 기존 양식과 다릅니다.");
  const groups = new Map();
  rows.slice(2).forEach((row) => {
    const officeCode = String(row[6] || "").trim();
    const meta = OFFICE_META[officeCode];
    const unit = String(row[11] || "").trim();
    if (!meta || !["DRUM", "EA"].includes(unit)) return;
    const division = meta.division;
    const office = meta.office;
    const product = productIndex >= 0 && row[productIndex] ? String(row[productIndex]).trim() : "유종 미분류";
    const id = [division, office, officeCode, product].join("||");
    if (!groups.has(id)) groups.set(id, { division, office, officeCode, product, quantityDrum: 0, quantityEa: 0, revenue: 0, grossProfit: 0, operatingProfit: 0 });
    const target = groups.get(id);
    target[unit === "DRUM" ? "quantityDrum" : "quantityEa"] += numeric(row[quantityIndex]);
    target.revenue += numeric(row[revenueIndex]);
    target.grossProfit += numeric(row[grossProfitIndex]);
    target.operatingProfit += numeric(row[operatingProfitIndex]);
  });
  const records = [...groups.values()].map(roundRecord);
  if (!records.length) return null;
  const period = detectMonthlyPeriod(workbook) || new Date().toISOString().slice(0, 7);
  return { period, records };
}

function parseMonthlyHistorySheets(workbook) {
  return workbook.SheetNames
    .map((sheetName) => ({ sheetName, period: periodFromSheetName(sheetName) }))
    .filter((item) => item.period)
    .map((item) => parseMonthlyPeriodSheet(workbook.Sheets[item.sheetName], item.period))
    .filter(Boolean)
    .sort((a, b) => a.period.localeCompare(b.period));
}

function parseMonthlyPeriodSheet(sheet, period) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headers = rows[1] || [];
  const indices = (label) => headers.reduce((found, value, index) => String(value || "").trim() === label ? [...found, index] : found, []);
  const planQuantityIndices = indices("계획수량");
  const quantityIndices = indices("실적수량");
  const priorQuantityIndices = indices("전년수량");
  const planRevenueIndices = indices("계획금액");
  const revenueIndices = indices("실적금액");
  const priorRevenueIndices = indices("전년금액");
  const grossProfitIndices = indices("실적매출이익");
  const operatingProfitIndices = indices("실적영업이익");
  if (!quantityIndices.length || !revenueIndices.length || !operatingProfitIndices.length) return null;
  const groups = new Map();
  rows.slice(2).forEach((row) => {
    const officeCode = String(row[6] || "").trim();
    const meta = OFFICE_META[officeCode];
    const unit = String(row[8] || "").trim();
    if (!meta || !["DRUM", "EA"].includes(unit)) return;
    const division = meta.division;
    const office = meta.office;
    const id = [division, office, officeCode].join("||");
    if (!groups.has(id)) groups.set(id, { division, office, officeCode, product: "유종 미분류", planQuantityDrum: 0, planQuantityEa: 0, quantityDrum: 0, quantityEa: 0, priorQuantityDrum: 0, priorQuantityEa: 0, ytdPlanQuantityDrum: 0, ytdPlanQuantityEa: 0, ytdQuantityDrum: 0, ytdQuantityEa: 0, ytdPriorQuantityDrum: 0, ytdPriorQuantityEa: 0, planRevenue: 0, revenue: 0, priorRevenue: 0, ytdPlanRevenue: 0, ytdRevenue: 0, ytdPriorRevenue: 0, grossProfit: 0, operatingProfit: 0 });
    const target = groups.get(id);
    const unitSuffix = unit === "DRUM" ? "Drum" : "Ea";
    target[`planQuantity${unitSuffix}`] += numeric(row[planQuantityIndices[0]]);
    target[`quantity${unitSuffix}`] += numeric(row[quantityIndices[0]]);
    target[`priorQuantity${unitSuffix}`] += numeric(row[priorQuantityIndices[0]]);
    target[`ytdPlanQuantity${unitSuffix}`] += numeric(row[planQuantityIndices[1]]);
    target[`ytdQuantity${unitSuffix}`] += numeric(row[quantityIndices[1]]);
    target[`ytdPriorQuantity${unitSuffix}`] += numeric(row[priorQuantityIndices[1]]);
    target.planRevenue += numeric(row[planRevenueIndices[0]]);
    target.revenue += numeric(row[revenueIndices[0]]);
    target.priorRevenue += numeric(row[priorRevenueIndices[0]]);
    target.ytdPlanRevenue += numeric(row[planRevenueIndices[1]]);
    target.ytdRevenue += numeric(row[revenueIndices[1]]);
    target.ytdPriorRevenue += numeric(row[priorRevenueIndices[1]]);
    target.grossProfit += numeric(row[grossProfitIndices[0]]);
    target.operatingProfit += numeric(row[operatingProfitIndices[0]]);
  });
  const records = [...groups.values()].map(roundRecord);
  const hasActuals = records.some((row) => row.quantityDrum || row.quantityEa || row.revenue || row.grossProfit || row.operatingProfit);
  return hasActuals ? { period, records } : null;
}

function periodFromSheetName(sheetName) {
  const match = String(sheetName).match(/^(\d{2})(0[1-9]|1[0-2])$/);
  return match ? `20${match[1]}-${match[2]}` : null;
}

function detectMonthlyPeriod(workbook) {
  const sheet = workbook.Sheets.BWC;
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const monthHeader = rows.findIndex((row) => row.some((cell) => cell === "1월") && row.some((cell) => cell === "12월"));
  if (monthHeader < 0) return null;
  const actualRow = rows.slice(monthHeader + 1).find((row) => row[2] === "실적");
  if (!actualRow) return null;
  let latest = 0;
  for (let month = 1; month <= 12; month += 1) if (numeric(actualRow[month + 2]) !== 0) latest = month;
  const yearText = JSON.stringify(rows.slice(0, monthHeader + 1)).match(/20\d{2}/)?.[0] || String(new Date().getFullYear());
  return latest ? `${yearText}-${String(latest).padStart(2, "0")}` : null;
}

function buildOrganization() {
  const map = new Map(DIVISIONS.map((division) => [division, new Set()]));
  Object.values(OFFICE_META).forEach((item) => map.get(item.division)?.add(item.office));
  return DIVISIONS.map((division) => ({ division, offices: [...map.get(division)].sort((a, b) => a.localeCompare(b, "ko")) }));
}

function mergePeriods(existing, incoming) {
  const map = new Map((existing || []).map((item) => [item.period, item]));
  (incoming || []).forEach((item) => map.set(item.period, item));
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}
function numeric(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function roundRecord(row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "number" ? Math.round(value * 100) / 100 : value])); }
function parseKoreanDate(value) { const match = String(value || "").match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/); if (!match) return null; let year = Number(match[1]); if (year > 2100 && String(year).startsWith("26")) year = 2026; return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`; }
function isoWeek(dateText) { const date = new Date(`${dateText}T00:00:00`); const target = new Date(date); target.setDate(target.getDate() + 4 - (target.getDay() || 7)); const start = new Date(target.getFullYear(), 0, 1); const week = Math.ceil((((target - start) / 86400000) + 1) / 7); return `${target.getFullYear()}-W${String(week).padStart(2, "0")}`; }
function setImportStatus(message, type = "") { const node = $("#importStatus"); node.textContent = message; node.className = `import-status ${type}`.trim(); }

function downloadImportedData() {
  if (!state.importedData) return;
  const blob = new Blob([JSON.stringify(state.importedData, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "data.json";
  link.click();
  URL.revokeObjectURL(link.href);
}
