const DEFAULT_CURRENCIES = [
  { code: "HKD", label: "港币", symbol: "HK$" },
  { code: "USD", label: "美元", symbol: "$" },
  { code: "CNY", label: "人民币", symbol: "¥" },
];

const STORAGE_KEY = "money-ledger-v1";
const THEME_STORAGE_KEY = "money-ledger-theme-v1";
const EXCHANGE_API_BASE = "https://api.frankfurter.dev/v2";
const AUTO_REFRESH_MS = 15 * 60 * 1000;
const HISTORY_DAYS = 365;
const CUSTOM_CURRENCY_VALUE = "__custom__";
const NEW_INSTITUTION_VALUE = "__new__";
const CONVERTER_SWAP_ANIMATION_MS = 260;
const CONVERTER_CURRENCIES = [
  { code: "HKD", label: "港币" },
  { code: "JPY", label: "日元" },
  { code: "USD", label: "美元" },
  { code: "KRW", label: "韩元" },
  { code: "CNY", label: "人民币" },
];
const CHART_RANGES = [
  { key: "week", label: "周", days: 7 },
  { key: "month", label: "月", days: 30 },
  { key: "year", label: "年", days: 365 },
];
const THEMES = [
  {
    key: "classic",
    label: "墨绿",
    description: "清爽稳重",
    colors: ["#116a54", "#d9ebe5", "#eff2ec"],
  },
  {
    key: "clay",
    label: "陶土",
    description: "Anthropic 感",
    colors: ["#9b5a3c", "#ead8c8", "#f2eee7"],
  },
  {
    key: "harbor",
    label: "海港蓝",
    description: "冷静清晰",
    colors: ["#2563eb", "#d5e2f3", "#eef3f8"],
  },
  {
    key: "amber",
    label: "晨光琥珀",
    description: "温暖柔和",
    colors: ["#b45309", "#f3dec0", "#f4efe6"],
  },
  {
    key: "berry",
    label: "莓果灰",
    description: "精致醒目",
    colors: ["#9d174d", "#ead4df", "#f1edf0"],
  },
  {
    key: "night",
    label: "夜间",
    description: "低亮护眼",
    colors: ["#38bdf8", "#1e3a4c", "#10171f"],
  },
];

const DEFAULT_STATE = {
  baseCurrency: "HKD",
  currencies: DEFAULT_CURRENCIES,
  ratesToHkd: {
    HKD: 1,
    USD: 7.8,
    CNY: 1.08,
  },
  rateMeta: {
    source: "Frankfurter",
    updatedAt: null,
    sourceDate: null,
  },
  rateHistory: {
    USD: [],
    CNY: [],
  },
  chartCurrency: "USD",
  chartRange: "month",
  converter: {
    fromAmount: 1,
    toAmount: 0,
    fromCurrency: "USD",
    toCurrency: "HKD",
    activeSide: "from",
  },
  banks: [],
  investmentInstitutions: [],
  investmentProducts: [],
};

let currentTheme = loadTheme();
let state = loadState();
let toastTimer = null;
let ratesRefreshTimer = null;
let isRefreshingRates = false;
let chartResizeTimer = null;
let editingBankId = null;
let chartHoverPoint = null;
let chartRenderState = { points: [], plot: null };
let isAnimatingConverterSwap = false;
let expandedInvestmentInstitutionIds = new Set();
let revealingInvestmentInstitutionId = null;

const elements = {
  grandTotal: document.querySelector("#grand-total"),
  currencyTotals: document.querySelector("#currency-totals"),
  baseCurrencyTabs: document.querySelector("#base-currency-tabs"),
  bankTableBody: document.querySelector("#bank-table-body"),
  bankEmptyState: document.querySelector("#bank-empty-state"),
  bankRowTemplate: document.querySelector("#bank-row-template"),
  investmentTableBody: document.querySelector("#investment-table-body"),
  investmentEmptyState: document.querySelector("#investment-empty-state"),
  investmentRowTemplate: document.querySelector("#investment-row-template"),
  addBankInline: document.querySelector("#add-bank-inline"),
  addProductInline: document.querySelector("#add-product-inline"),
  refreshRates: document.querySelector("#refresh-rates"),
  rateConverter: document.querySelector(".rate-converter"),
  converterFromAmount: document.querySelector("#converter-from-amount"),
  converterToAmount: document.querySelector("#converter-to-amount"),
  converterFromCurrency: document.querySelector("#converter-from-currency"),
  converterToCurrency: document.querySelector("#converter-to-currency"),
  converterSwap: document.querySelector("#converter-swap"),
  rateDisplays: document.querySelector("#rate-displays"),
  ratesStatus: document.querySelector("#rates-status"),
  rateChart: document.querySelector("#rate-chart"),
  chartTooltip: document.querySelector("#chart-tooltip"),
  chartPairTabs: document.querySelector("#chart-pair-tabs"),
  chartRangeTabs: document.querySelector("#chart-range-tabs"),
  chartRange: document.querySelector("#chart-range"),
  chartLatest: document.querySelector("#chart-latest"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
  themeTrigger: document.querySelector("#theme-trigger"),
  themeTriggerSwatch: document.querySelector("#theme-trigger-swatch"),
  themeMenu: document.querySelector("#theme-menu"),
  bankModal: document.querySelector("#bank-modal"),
  bankModalTitle: document.querySelector("#bank-modal-title"),
  bankModalForm: document.querySelector("#bank-modal-form"),
  modalBankName: document.querySelector("#modal-bank-name"),
  bankBalanceEditor: document.querySelector("#bank-balance-editor"),
  addBankBalanceRow: document.querySelector("#add-bank-balance-row"),
  institutionModal: document.querySelector("#institution-modal"),
  institutionModalForm: document.querySelector("#institution-modal-form"),
  modalInstitutionName: document.querySelector("#modal-institution-name"),
  productModal: document.querySelector("#product-modal"),
  productModalForm: document.querySelector("#product-modal-form"),
  modalProductInstitution: document.querySelector("#modal-product-institution"),
  newInstitutionField: document.querySelector("#new-institution-field"),
  modalNewInstitution: document.querySelector("#modal-new-institution"),
  modalProductName: document.querySelector("#modal-product-name"),
  modalProductValue: document.querySelector("#modal-product-value"),
  productCurrencyEditor: document.querySelector("#product-currency-editor"),
  currencyRowTemplate: document.querySelector("#currency-row-template"),
};

applyTheme(currentTheme);
render();
bindEvents();
scheduleRateRefresh();
queueInitialRateRefresh();

function bindEvents() {
  elements.refreshRates.addEventListener("click", () => {
    refreshExchangeRates({ manual: true });
  });

  elements.converterFromAmount.addEventListener("input", () => {
    state.converter.fromAmount = normalizeAmount(elements.converterFromAmount.value);
    state.converter.activeSide = "from";
    updateConverterCounterpart();
    persist();
    renderConverter();
  });

  elements.converterToAmount.addEventListener("input", () => {
    state.converter.toAmount = normalizeAmount(elements.converterToAmount.value);
    state.converter.activeSide = "to";
    updateConverterCounterpart();
    persist();
    renderConverter();
  });

  elements.converterFromCurrency.addEventListener("change", () => {
    state.converter.fromCurrency = elements.converterFromCurrency.value;
    updateConverterCounterpart();
    persist();
    renderConverter();
    ensureLatestRateForCurrency(state.converter.fromCurrency);
  });

  elements.converterToCurrency.addEventListener("change", () => {
    state.converter.toCurrency = elements.converterToCurrency.value;
    updateConverterCounterpart();
    persist();
    renderConverter();
    ensureLatestRateForCurrency(state.converter.toCurrency);
  });

  elements.converterSwap.addEventListener("click", swapConverterCurrencies);

  elements.baseCurrencyTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-base]");
    if (!button) return;

    state.baseCurrency = button.dataset.base;
    persist();
    render();
  });

  elements.addBankInline.addEventListener("click", openBankModal);
  elements.addProductInline.addEventListener("click", openInstitutionModal);
  elements.addBankBalanceRow.addEventListener("click", () => addCurrencyRow(elements.bankBalanceEditor));

  elements.bankModalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addBankFromModal();
  });

  elements.productModalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addInvestmentProductFromModal();
  });

  elements.institutionModalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addInvestmentInstitutionFromModal();
  });

  [elements.bankBalanceEditor, elements.productCurrencyEditor].forEach((editor) => {
    editor.addEventListener("change", (event) => {
      const select = event.target.closest(".currency-select");
      if (select) updateCurrencyRowMode(select.closest(".currency-row"));
    });

    editor.addEventListener("click", (event) => {
      const removeButton = event.target.closest(".remove-currency-row");
      if (!removeButton) return;
      const row = removeButton.closest(".currency-row");
      const editorRows = [...editor.querySelectorAll(".currency-row")];
      if (editorRows.length === 1) {
        row.querySelector(".currency-amount").value = "0";
        return;
      }
      row.remove();
    });
  });

  elements.modalProductInstitution.addEventListener("change", renderNewInstitutionField);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) closeModals();
    if (!event.target.closest(".theme-picker")) closeThemeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModals();
    if (event.key === "Escape") closeThemeMenu();
  });

  elements.bankTableBody.addEventListener("input", (event) => {
    const row = event.target.closest("tr");
    const bank = state.banks.find((item) => item.id === row?.dataset.bankId);
    if (!bank || !event.target.classList.contains("bank-name-input")) return;

    bank.name = event.target.value.slice(0, 40);
    persist();
  });

  elements.bankTableBody.addEventListener("click", (event) => {
    const balanceChip = event.target.closest(".balance-chip[data-currency]");
    if (balanceChip) {
      startInlineBalanceEdit(balanceChip);
      return;
    }

    const editButton = event.target.closest(".edit-bank");
    if (editButton) {
      openBankModal(editButton.closest("tr").dataset.bankId);
      return;
    }

    const deleteButton = event.target.closest(".delete-bank");
    if (!deleteButton) return;
    deleteBank(deleteButton.closest("tr").dataset.bankId);
  });

  elements.investmentTableBody.addEventListener("input", (event) => {
    const row = event.target.closest("tr");
    if (!row) return;
    updateInvestmentFromRow(row, event.target);
  });

  elements.investmentTableBody.addEventListener("change", (event) => {
    const row = event.target.closest("tr");
    if (!row) return;
    updateInvestmentFromRow(row, event.target);
  });

  elements.investmentTableBody.addEventListener("click", (event) => {
    const addProductButton = event.target.closest(".add-product-to-institution");
    if (addProductButton) {
      openProductModal(addProductButton.dataset.institutionId);
      return;
    }

    const groupToggle = event.target.closest(".investment-group-toggle");
    if (groupToggle) {
      toggleInvestmentInstitution(groupToggle.dataset.institutionId);
      return;
    }

    const deleteButton = event.target.closest(".delete-product");
    if (!deleteButton) return;
    deleteInvestmentProduct(deleteButton.closest("tr").dataset.productId);
  });

  elements.chartPairTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pair]");
    if (!button) return;

    state.chartCurrency = button.dataset.pair;
    persist();
    hideChartTooltip({ skipRender: true });
    renderChartTabs();
    renderRateChart();
    ensureHistoryForCurrency(state.chartCurrency);
  });

  elements.chartRangeTabs.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-range]");
    if (!button) return;

    state.chartRange = button.dataset.range;
    persist();
    hideChartTooltip({ skipRender: true });
    renderChartRangeTabs();
    renderRateChart();
    await ensureHistoryForCurrency(state.chartCurrency, { force: state.chartRange === "year" });
    renderRateChart();
  });

  elements.exportData.addEventListener("click", exportLedger);
  elements.importData.addEventListener("change", importLedger);
  elements.themeTrigger.addEventListener("click", () => {
    toggleThemeMenu();
  });
  elements.themeMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme]");
    if (!button) return;
    setTheme(button.dataset.theme);
    closeThemeMenu();
  });
  elements.rateChart.addEventListener("mousemove", handleChartPointerMove);
  elements.rateChart.addEventListener("mouseleave", hideChartTooltip);

  window.addEventListener("resize", () => {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(renderRateChart, 120);
  });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return cloneDefaultState();
    return migrateImportedState(saved);
  } catch {
    return cloneDefaultState();
  }
}

function loadTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return getTheme(savedTheme)?.key || THEMES[0].key;
  } catch {
    return THEMES[0].key;
  }
}

function getTheme(themeKey) {
  return THEMES.find((theme) => theme.key === themeKey);
}

function applyTheme(themeKey) {
  const theme = getTheme(themeKey) || THEMES[0];
  currentTheme = theme.key;
  if (theme.key === THEMES[0].key) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = theme.key;
  }
  if (elements.themeTriggerSwatch) {
    elements.themeTriggerSwatch.style.setProperty("--theme-swatch-primary", theme.colors[0]);
    elements.themeTriggerSwatch.style.setProperty("--theme-swatch-soft", theme.colors[1]);
    elements.themeTriggerSwatch.style.setProperty("--theme-swatch-bg", theme.colors[2]);
  }
}

function setTheme(themeKey) {
  const theme = getTheme(themeKey);
  if (!theme) return;

  applyTheme(theme.key);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.key);
  } catch {
    // Theme persistence is a best-effort UI preference.
  }
  renderThemePicker();
  renderRateChart();
}

function toggleThemeMenu() {
  const willOpen = elements.themeMenu.hidden;
  elements.themeMenu.hidden = !willOpen;
  elements.themeTrigger.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) renderThemePicker();
}

function closeThemeMenu() {
  elements.themeMenu.hidden = true;
  elements.themeTrigger.setAttribute("aria-expanded", "false");
}

function migrateImportedState(importedState) {
  const banks = Array.isArray(importedState.banks)
    ? importedState.banks.map(normalizeBank)
    : [];
  const investmentInstitutions = Array.isArray(importedState.investmentInstitutions)
    ? importedState.investmentInstitutions.map(normalizeInstitution)
    : [];
  const investmentProducts = Array.isArray(importedState.investmentProducts)
    ? importedState.investmentProducts.map(normalizeInvestmentProduct)
    : [];
  const currencies = normalizeCurrencies(importedState.currencies, banks, investmentProducts);

  return {
    ...cloneDefaultState(),
    ...importedState,
    currencies,
    ratesToHkd: normalizeRates(importedState.ratesToHkd, currencies),
    rateMeta: {
      ...DEFAULT_STATE.rateMeta,
      ...(importedState.rateMeta || {}),
      source: "Frankfurter",
    },
    rateHistory: normalizeRateHistory(importedState.rateHistory),
    chartCurrency: getInitialChartCurrency(importedState.chartCurrency, currencies),
    chartRange: CHART_RANGES.some((range) => range.key === importedState.chartRange)
      ? importedState.chartRange
      : DEFAULT_STATE.chartRange,
    converter: normalizeConverter(importedState.converter),
    baseCurrency: currencies.some((currency) => currency.code === importedState.baseCurrency)
      ? importedState.baseCurrency
      : DEFAULT_STATE.baseCurrency,
    banks,
    investmentInstitutions,
    investmentProducts,
  };
}

function normalizeCurrencies(savedCurrencies, banks = [], investmentProducts = []) {
  const byCode = new Map();
  DEFAULT_CURRENCIES.forEach((currency) => byCode.set(currency.code, { ...currency }));

  if (Array.isArray(savedCurrencies)) {
    savedCurrencies.forEach((currency) => {
      const normalized = normalizeCurrency(currency);
      if (normalized) byCode.set(normalized.code, normalized);
    });
  }

  banks.forEach((bank) => {
    Object.keys(bank.balances || {}).forEach((code) => {
      if (!byCode.has(code)) byCode.set(code, createCurrency(code));
    });
  });

  investmentProducts.forEach((product) => {
    if (!byCode.has(product.currency)) byCode.set(product.currency, createCurrency(product.currency));
  });

  return [...byCode.values()];
}

function normalizeCurrency(currency) {
  const code = normalizeCurrencyCode(currency?.code);
  if (!code) return null;

  const defaultCurrency = DEFAULT_CURRENCIES.find((item) => item.code === code);
  return {
    code,
    label: String(currency?.label || defaultCurrency?.label || code).slice(0, 20),
    symbol: String(currency?.symbol || defaultCurrency?.symbol || `${code} `).slice(0, 8),
  };
}

function createCurrency(code, label = "") {
  const normalizedCode = normalizeCurrencyCode(code);
  const defaultCurrency = DEFAULT_CURRENCIES.find((currency) => currency.code === normalizedCode);
  return {
    code: normalizedCode,
    label: label.trim() || defaultCurrency?.label || normalizedCode,
    symbol: defaultCurrency?.symbol || `${normalizedCode} `,
  };
}

function normalizeCurrencyCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return code.length >= 3 && code.length <= 6 ? code : "";
}

function normalizeRates(savedRates, currencies) {
  const rates = {
    ...DEFAULT_STATE.ratesToHkd,
    ...(savedRates || {}),
    HKD: 1,
  };

  currencies.forEach((currency) => {
    if (currency.code === "HKD") rates.HKD = 1;
    else if (normalizeAmount(rates[currency.code]) <= 0) delete rates[currency.code];
    else rates[currency.code] = normalizeAmount(rates[currency.code]);
  });

  return rates;
}

function normalizeRateHistory(history) {
  return Object.entries(history || {}).reduce((result, [currency, rows]) => {
    const code = normalizeCurrencyCode(currency);
    if (!code || !Array.isArray(rows)) return result;

    result[code] = rows
      .map((entry) => ({
        date: String(entry.date || ""),
        rate: normalizeAmount(entry.rate),
      }))
      .filter((entry) => entry.date && entry.rate > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, {});
}

function getInitialChartCurrency(savedChartCurrency, currencies) {
  const code = normalizeCurrencyCode(savedChartCurrency);
  if (code && code !== "HKD" && currencies.some((currency) => currency.code === code)) return code;
  return currencies.find((currency) => currency.code !== "HKD")?.code || "USD";
}

function normalizeConverter(converter = {}) {
  const fromCurrency = normalizeCurrencyCode(converter.fromCurrency || converter.currency);
  const toCurrency = normalizeCurrencyCode(converter.toCurrency || "HKD");
  const activeSide = converter.activeSide === "to" ? "to" : "from";
  return {
    fromAmount: normalizeAmount(converter.fromAmount ?? converter.amount) || 1,
    toAmount: normalizeAmount(converter.toAmount),
    fromCurrency: isConverterCurrency(fromCurrency) ? fromCurrency : "USD",
    toCurrency: isConverterCurrency(toCurrency) ? toCurrency : "HKD",
    activeSide,
  };
}

function normalizeBank(bank) {
  const balances = {};
  Object.entries(bank.balances || {}).forEach(([currency, value]) => {
    const code = normalizeCurrencyCode(currency);
    if (code) balances[code] = normalizeAmount(value);
  });

  return {
    id: String(bank.id || createId()),
    name: String(bank.name || "未命名银行").slice(0, 40),
    balances,
  };
}

function normalizeInstitution(institution) {
  return {
    id: String(institution.id || createId()),
    name: String(institution.name || "未命名机构").slice(0, 40),
  };
}

function normalizeInvestmentProduct(product) {
  return {
    id: String(product.id || createId()),
    institutionId: String(product.institutionId || ""),
    name: String(product.name || "未命名产品").slice(0, 60),
    currency: normalizeCurrencyCode(product.currency) || "HKD",
    value: normalizeAmount(product.value),
  };
}

function openBankModal(bankId = null) {
  editingBankId = bankId;
  const bank = state.banks.find((item) => item.id === bankId);
  elements.bankModalForm.reset();
  elements.bankBalanceEditor.innerHTML = "";
  elements.bankModalTitle.textContent = bank ? "编辑银行余额" : "新增银行";
  elements.modalBankName.value = bank?.name || "";

  const balanceEntries = Object.entries(bank?.balances || {});
  if (balanceEntries.length) {
    balanceEntries.forEach(([currency, amount]) => {
      addCurrencyRow(elements.bankBalanceEditor, { currency, amount });
    });
  } else {
    addCurrencyRow(elements.bankBalanceEditor, { currency: "HKD", amount: 0 });
  }

  openModal(elements.bankModal);
  setTimeout(() => elements.modalBankName.focus(), 0);
}

function openInstitutionModal() {
  elements.institutionModalForm.reset();
  openModal(elements.institutionModal);
  setTimeout(() => elements.modalInstitutionName.focus(), 0);
}

function openProductModal(institutionId) {
  if (!state.investmentInstitutions.some((institution) => institution.id === institutionId)) {
    showToast("请先选择理财机构");
    return;
  }

  elements.productModalForm.reset();
  elements.modalProductValue.value = "0";
  renderModalInstitutionOptions(institutionId);
  elements.modalProductInstitution.disabled = true;
  elements.productCurrencyEditor.innerHTML = "";
  addCurrencyRow(elements.productCurrencyEditor, { currency: "HKD", amount: 0 });
  renderNewInstitutionField();
  openModal(elements.productModal);
  setTimeout(() => elements.modalProductName.focus(), 0);
}

function openModal(modal) {
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModals() {
  elements.bankModal.hidden = true;
  elements.institutionModal.hidden = true;
  elements.productModal.hidden = true;
  document.body.classList.remove("modal-open");
  editingBankId = null;
  elements.modalProductInstitution.disabled = false;
}

function addCurrencyRow(editor, values = {}) {
  const row = elements.currencyRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".currency-amount").value = formatPlainAmount(normalizeAmount(values.amount));
  populateCurrencySelect(row.querySelector(".currency-select"), values.currency || "HKD");
  editor.append(row);
  updateCurrencyRowMode(row);

  if (editor === elements.productCurrencyEditor) {
    row.classList.add("single-currency-row");
    row.querySelector(".currency-amount").closest("label").hidden = true;
    row.querySelector(".remove-currency-row").hidden = true;
  }
}

function populateCurrencySelect(select, selectedCurrency = "HKD") {
  const hasSelected = state.currencies.some((currency) => currency.code === selectedCurrency);
  select.innerHTML = [
    ...state.currencies.map((currency) => {
      return `<option value="${currency.code}">${currency.code} · ${escapeHtml(currency.label)}</option>`;
    }),
    `<option value="${CUSTOM_CURRENCY_VALUE}">新增币种</option>`,
  ].join("");
  select.value = hasSelected ? selectedCurrency : CUSTOM_CURRENCY_VALUE;
}

function updateCurrencyRowMode(row) {
  const isCustom = row.querySelector(".currency-select").value === CUSTOM_CURRENCY_VALUE;
  row.querySelector(".custom-currency-code-field").hidden = !isCustom;
  row.querySelector(".custom-currency-label-field").hidden = !isCustom;
}

function renderModalInstitutionOptions(selectedInstitutionId = "") {
  const existingOptions = state.investmentInstitutions
    .map((institution) => {
      return `<option value="${institution.id}">${escapeHtml(institution.name)}</option>`;
    })
    .join("");

  elements.modalProductInstitution.innerHTML = existingOptions;
  elements.modalProductInstitution.value =
    selectedInstitutionId || state.investmentInstitutions[0]?.id || "";
}

function renderNewInstitutionField() {
  elements.newInstitutionField.hidden = true;
  elements.modalNewInstitution.required = false;
}

function addBankFromModal() {
  const name = elements.modalBankName.value.trim();
  if (!name) {
    elements.modalBankName.focus();
    return;
  }

  const balances = collectCurrencyRows(elements.bankBalanceEditor);
  if (!balances) return;

  const bank = state.banks.find((item) => item.id === editingBankId);
  if (bank) {
    bank.name = name;
    bank.balances = balances;
  } else {
    state.banks.push({
      id: createId(),
      name,
      balances,
    });
  }

  persist();
  render();
  closeModals();
  showToast(bank ? "银行余额已更新" : "银行已添加");
  refreshMissingRatesForBalances(balances);
}

function addInvestmentInstitutionFromModal() {
  const name = elements.modalInstitutionName.value.trim();
  if (!name) {
    elements.modalInstitutionName.focus();
    return;
  }

  const institution = createInvestmentInstitution(name);
  expandedInvestmentInstitutionIds.add(institution.id);
  persist();
  render();
  closeModals();
  showToast("理财机构已添加");
}

function addInvestmentProductFromModal() {
  const institutionId = resolveModalInstitutionId();
  if (!institutionId) return;

  const name = elements.modalProductName.value.trim();
  if (!name) {
    elements.modalProductName.focus();
    return;
  }

  const currency = collectSingleCurrency(elements.productCurrencyEditor);
  if (!currency) return;

  state.investmentProducts.push({
    id: createId(),
    institutionId,
    name,
    currency,
    value: normalizeAmount(elements.modalProductValue.value),
  });
  expandedInvestmentInstitutionIds.add(institutionId);
  revealingInvestmentInstitutionId = institutionId;

  persist();
  render();
  closeModals();
  showToast("理财产品已添加");
  ensureLatestRateForCurrency(currency);
}

function resolveModalInstitutionId() {
  return elements.modalProductInstitution.value;
}

function createInvestmentInstitution(name) {
  const institution = {
    id: createId(),
    name,
  };
  state.investmentInstitutions.push(institution);
  return institution;
}

function collectCurrencyRows(editor) {
  const balances = {};
  const rows = [...editor.querySelectorAll(".currency-row")];

  for (const row of rows) {
    const currency = resolveCurrencyFromRow(row);
    if (!currency) return null;

    const amount = normalizeAmount(row.querySelector(".currency-amount").value);
    balances[currency] = normalizeAmount(balances[currency]) + amount;
  }

  if (!Object.keys(balances).length) {
    showToast("请至少添加一个币种");
    return null;
  }

  return balances;
}

function collectSingleCurrency(editor) {
  const row = editor.querySelector(".currency-row");
  return resolveCurrencyFromRow(row);
}

function resolveCurrencyFromRow(row) {
  const select = row.querySelector(".currency-select");
  if (select.value !== CUSTOM_CURRENCY_VALUE) return select.value;

  const code = normalizeCurrencyCode(row.querySelector(".custom-currency-code").value);
  const label = row.querySelector(".custom-currency-label").value.trim();
  if (!code) {
    row.querySelector(".custom-currency-code").focus();
    showToast("请输入 3-6 位币种代码");
    return "";
  }

  if (!state.currencies.some((currency) => currency.code === code)) {
    state.currencies.push(createCurrency(code, label));
  }
  return code;
}

function refreshMissingRatesForBalances(balances) {
  Object.keys(balances).forEach((currency) => ensureLatestRateForCurrency(currency));
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateInvestmentFromRow(row, target) {
  const product = state.investmentProducts.find((item) => item.id === row.dataset.productId);
  if (!product) return;

  if (target.classList.contains("product-name-input")) {
    product.name = target.value.slice(0, 60);
  }

  if (target.classList.contains("product-currency-select")) {
    product.currency = target.value;
    ensureLatestRateForCurrency(product.currency);
  }

  if (target.classList.contains("product-value-input")) {
    product.value = normalizeAmount(target.value);
  }

  persist();
  renderSummary();
  renderInvestmentRowTotal(row, product);
  updateInvestmentGroupTotal(product.institutionId);
}

function deleteBank(bankId) {
  const bank = state.banks.find((item) => item.id === bankId);
  if (!bank) return;

  const confirmed = confirm(`删除「${bank.name || "未命名银行"}」？`);
  if (!confirmed) return;

  state.banks = state.banks.filter((item) => item.id !== bankId);
  persist();
  render();
  showToast("银行已删除");
}

function deleteInvestmentProduct(productId) {
  const product = state.investmentProducts.find((item) => item.id === productId);
  if (!product) return;

  const confirmed = confirm(`删除「${product.name || "未命名产品"}」？`);
  if (!confirmed) return;

  state.investmentProducts = state.investmentProducts.filter((item) => item.id !== productId);
  persist();
  render();
  showToast("理财产品已删除");
}

function queueInitialRateRefresh() {
  setTimeout(() => refreshExchangeRates({ silent: true }), 350);
}

function scheduleRateRefresh() {
  clearInterval(ratesRefreshTimer);
  ratesRefreshTimer = setInterval(() => {
    refreshExchangeRates({ silent: true });
  }, AUTO_REFRESH_MS);
}

async function refreshExchangeRates({ manual = false, silent = false } = {}) {
  if (isRefreshingRates) return;

  isRefreshingRates = true;
  renderRatesPanel();

  const currencies = getFetchRateCurrencies();
  const latestResults = await Promise.allSettled(currencies.map((currency) => fetchLatestRate(currency.code)));
  const historyResults = await Promise.allSettled(
    currencies.map((currency) => fetchRateHistory(currency.code)),
  );

  let latestSuccessCount = 0;
  const sourceDates = new Set();

  latestResults.forEach((result, index) => {
    const code = currencies[index].code;
    if (result.status !== "fulfilled") return;
    state.ratesToHkd[code] = result.value.rate;
    sourceDates.add(result.value.date);
    latestSuccessCount += 1;
  });

  historyResults.forEach((result, index) => {
    const code = currencies[index].code;
    if (result.status === "fulfilled" && result.value.length) {
      state.rateHistory[code] = result.value;
    }
  });

  if (latestSuccessCount > 0) {
    state.rateMeta.source = "Frankfurter";
    state.rateMeta.updatedAt = new Date().toISOString();
    state.rateMeta.sourceDate = [...sourceDates].sort().join(" / ");
    persist();
  }

  isRefreshingRates = false;
  render();

  if (manual) {
    showToast(
      latestSuccessCount === currencies.length
        ? "实时汇率已更新"
        : "部分币种未取得实时汇率",
    );
  } else if (!silent && latestSuccessCount === 0) {
    showToast("汇率更新失败，已保留上次汇率");
  }
}

async function ensureLatestRateForCurrency(code, { manual = false } = {}) {
  if (code === "HKD") return;
  if (isRefreshingRates) {
    setTimeout(() => ensureLatestRateForCurrency(code, { manual }), 1000);
    return;
  }

  try {
    const [latest, history] = await Promise.all([fetchLatestRate(code), fetchRateHistory(code)]);
    state.ratesToHkd[code] = latest.rate;
    state.rateHistory[code] = history;
    state.rateMeta.source = "Frankfurter";
    state.rateMeta.updatedAt = new Date().toISOString();
    state.rateMeta.sourceDate = latest.date;
    persist();
    render();
    if (manual) showToast(`${code}/HKD 实时汇率已添加`);
  } catch {
    persist();
    render();
    showToast(`${code} 暂未取得实时汇率`);
  }
}

async function ensureHistoryForCurrency(code, { force = false } = {}) {
  if (code === "HKD") return;
  if (!force && state.rateHistory[code]?.length) return;

  try {
    state.rateHistory[code] = await fetchRateHistory(code);
    persist();
    renderRateChart();
  } catch {
    renderRateChart();
  }
}

async function fetchLatestRate(currency) {
  const data = await fetchJson(`${EXCHANGE_API_BASE}/rate/${currency}/HKD`);
  const rate = normalizeAmount(data.rate);
  if (!data.date || rate <= 0) throw new Error(`Invalid ${currency}/HKD rate`);
  return { date: data.date, rate };
}

async function fetchRateHistory(currency) {
  const fromDate = getIsoDateDaysAgo(HISTORY_DAYS);
  const data = await fetchJson(
    `${EXCHANGE_API_BASE}/rates?base=${currency}&quotes=HKD&from=${fromDate}`,
  );

  return normalizeHistoryPayload(data)
    .filter((entry) => entry.rate > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Exchange API ${response.status}`);
  return response.json();
}

function normalizeHistoryPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((entry) => ({
      date: String(entry.date || ""),
      rate: normalizeAmount(entry.rate ?? entry.rates?.HKD),
    }));
  }

  if (payload?.rates && typeof payload.rates === "object") {
    return Object.entries(payload.rates).map(([date, rates]) => ({
      date,
      rate: normalizeAmount(rates.HKD),
    }));
  }

  return [];
}

function render() {
  renderThemePicker();
  renderBaseCurrencyTabs();
  renderRatesPanel();
  renderSummary();
  renderBankTable();
  renderInvestmentTable();
  renderRateChart();
}

function renderThemePicker() {
  const theme = getTheme(currentTheme) || THEMES[0];
  applyTheme(theme.key);
  elements.themeMenu.innerHTML = THEMES.map((item) => {
    const active = item.key === currentTheme ? " active" : "";
    const swatches = item.colors
      .map((color) => `<span style="background: ${color}"></span>`)
      .join("");
    return `
      <button class="theme-option${active}" type="button" data-theme="${item.key}" aria-pressed="${item.key === currentTheme}">
        <span class="theme-option-swatch" aria-hidden="true">${swatches}</span>
        <span class="theme-option-label">
          <strong>${escapeHtml(item.label)}</strong>
          <small>${escapeHtml(item.description)}</small>
        </span>
        <span class="theme-check" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      </button>
    `;
  }).join("");
}

function renderBaseCurrencyTabs() {
  elements.baseCurrencyTabs.innerHTML = state.currencies
    .map((currency) => {
      const active = currency.code === state.baseCurrency ? " active" : "";
      return `<button class="segment${active}" type="button" data-base="${currency.code}">${currency.code}</button>`;
    })
    .join("");
}

function renderRatesPanel() {
  elements.refreshRates.disabled = isRefreshingRates;
  elements.refreshRates.classList.toggle("loading", isRefreshingRates);
  elements.ratesStatus.textContent = getRateStatusText();
  renderConverter();
  elements.rateDisplays.innerHTML = getRateCurrencies()
    .map((currency) => {
      const rate = getRateToHkd(currency.code);
      return `
        <div class="rate-display">
          <span>1 ${currency.code} = HKD</span>
          <strong>${rate ? formatRateLabel(rate) : "等待汇率"}</strong>
        </div>
      `;
    })
    .join("");
  renderChartTabs();
  renderChartRangeTabs();
}

function renderConverter() {
  updateConverterCounterpart();
  renderConverterSelect(elements.converterFromCurrency, state.converter.fromCurrency);
  renderConverterSelect(elements.converterToCurrency, state.converter.toCurrency);

  if (document.activeElement !== elements.converterFromAmount) {
    elements.converterFromAmount.value = formatConverterAmount(state.converter.fromAmount);
  }
  if (document.activeElement !== elements.converterToAmount) {
    elements.converterToAmount.value = formatConverterAmount(state.converter.toAmount);
    elements.converterToAmount.placeholder = state.converter.toAmount == null ? "等待汇率" : "";
  }
}

function renderConverterSelect(select, value) {
  select.innerHTML = CONVERTER_CURRENCIES.map((currency) => {
    return `<option value="${currency.code}">${currency.code} · ${currency.label}</option>`;
  }).join("");
  select.value = value;
}

function swapConverterCurrencies() {
  if (isAnimatingConverterSwap) return;

  isAnimatingConverterSwap = true;
  elements.rateConverter.classList.add("is-swapping");
  elements.converterSwap.disabled = true;

  const nextFromCurrency = state.converter.toCurrency;
  const nextToCurrency = state.converter.fromCurrency;

  state.converter.fromCurrency = nextFromCurrency;
  state.converter.toCurrency = nextToCurrency;
  updateConverterCounterpart();
  persist();
  renderConverter();
  ensureLatestRateForCurrency(state.converter.fromCurrency);
  ensureLatestRateForCurrency(state.converter.toCurrency);

  window.setTimeout(() => {
    elements.rateConverter.classList.remove("is-swapping");
    elements.converterSwap.disabled = false;
    isAnimatingConverterSwap = false;
  }, CONVERTER_SWAP_ANIMATION_MS);
}

function updateConverterCounterpart() {
  if (state.converter.activeSide === "to") {
    state.converter.fromAmount = convertCurrency(
      state.converter.toAmount,
      state.converter.toCurrency,
      state.converter.fromCurrency,
    );
    return;
  }

  state.converter.toAmount = convertCurrency(
    state.converter.fromAmount,
    state.converter.fromCurrency,
    state.converter.toCurrency,
  );
}

function renderChartTabs() {
  const currencies = getRateCurrencies();
  if (!currencies.some((currency) => currency.code === state.chartCurrency)) {
    state.chartCurrency = currencies[0]?.code || "USD";
  }

  elements.chartPairTabs.innerHTML = currencies
    .map((currency) => {
      const active = currency.code === state.chartCurrency ? " active" : "";
      return `<button class="mini-segment${active}" type="button" data-pair="${currency.code}">${currency.code}/HKD</button>`;
    })
    .join("");
}

function renderChartRangeTabs() {
  elements.chartRangeTabs.innerHTML = CHART_RANGES.map((range) => {
    const active = range.key === state.chartRange ? " active" : "";
    return `<button class="mini-segment${active}" type="button" data-range="${range.key}">${range.label}</button>`;
  }).join("");
}

function renderSummary() {
  const totals = calculateCurrencyTotals();
  const grandTotalHkd = toHkd(totals);
  const baseTotal = fromHkd(grandTotalHkd, state.baseCurrency);

  elements.grandTotal.textContent = baseTotal == null
    ? "等待汇率"
    : formatMoney(baseTotal, state.baseCurrency);
  elements.currencyTotals.innerHTML = state.currencies
    .map((currency) => {
      const total = totals[currency.code] || 0;
      return `
        <div class="currency-total">
          <span>${currency.label}</span>
          <strong>${formatMoney(total, currency.code)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderBankTable() {
  elements.bankTableBody.innerHTML = "";
  elements.bankEmptyState.classList.toggle("visible", state.banks.length === 0);

  state.banks.forEach((bank) => {
    const row = elements.bankRowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.bankId = bank.id;
    row.querySelector(".bank-name-input").value = bank.name;
    row.querySelector(".balance-list").innerHTML = formatBalanceList(bank.balances);
    renderRowTotal(row, bank.balances);
    elements.bankTableBody.append(row);
  });
}

function renderInvestmentTable() {
  elements.investmentTableBody.innerHTML = "";
  elements.investmentEmptyState.classList.toggle(
    "visible",
    state.investmentInstitutions.length === 0,
  );

  getInvestmentInstitutionGroups().forEach((group) => {
    const isExpanded = expandedInvestmentInstitutionIds.has(group.id);
    const shouldRevealProducts = isExpanded && group.id === revealingInvestmentInstitutionId;
    elements.investmentTableBody.append(createInvestmentGroupRow(group, isExpanded));

    if (!isExpanded) return;
    group.products.forEach((product, index) => {
      const row = createInvestmentProductRow(product, {
        reveal: shouldRevealProducts,
        revealIndex: index,
      });
      elements.investmentTableBody.append(row);
    });
  });
  revealingInvestmentInstitutionId = null;
}

function createInvestmentGroupRow(group, isExpanded) {
  const row = document.createElement("tr");
  row.className = "investment-group-row";
  row.dataset.institutionId = group.id;
  row.innerHTML = `
    <td colspan="6">
      <div class="investment-group-line">
        <button class="investment-group-toggle" type="button" data-institution-id="${escapeHtml(group.id)}" aria-expanded="${isExpanded}">
          <span class="group-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
          </span>
          <span class="group-title">${escapeHtml(group.name)}</span>
        </button>
        <span class="group-product-actions">
          <span class="group-count">${group.products.length} 个产品</span>
          <button class="icon-button add-product-to-institution" type="button" data-institution-id="${escapeHtml(group.id)}" title="新增产品" aria-label="为 ${escapeHtml(group.name)} 新增产品">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </span>
        <strong class="group-total">${group.totalText}</strong>
      </div>
    </td>
  `;
  return row;
}

function createInvestmentProductRow(product, options = {}) {
  const row = elements.investmentRowTemplate.content.firstElementChild.cloneNode(true);
  row.classList.add("investment-product-row");
  if (options.reveal) {
    row.classList.add("is-revealing");
    row.style.setProperty("--reveal-delay", `${Math.min(options.revealIndex * 34, 136)}ms`);
  }
  row.dataset.productId = product.id;
  row.querySelector(".product-name-input").value = product.name;
  row.querySelector(".product-value-input").value = formatPlainAmount(product.value);

  const currencySelect = row.querySelector(".product-currency-select");
  currencySelect.innerHTML = state.currencies
    .map((currency) => {
      return `<option value="${currency.code}">${currency.code}</option>`;
    })
    .join("");
  currencySelect.value = product.currency;

  renderInvestmentRowTotal(row, product);
  return row;
}

function getInvestmentInstitutionGroups() {
  const byId = new Map();
  state.investmentInstitutions.forEach((institution) => {
    byId.set(institution.id, {
      id: institution.id,
      name: institution.name,
      products: [],
    });
  });

  state.investmentProducts.forEach((product) => {
    if (!byId.has(product.institutionId)) {
      byId.set(product.institutionId || "unassigned", {
        id: product.institutionId || "unassigned",
        name: "未分配机构",
        products: [],
      });
    }
    byId.get(product.institutionId || "unassigned").products.push(product);
  });

  return [...byId.values()].map((group) => ({
    ...group,
    totalText: formatInvestmentGroupTotal(group.products),
  }));
}

function formatInvestmentGroupTotal(products) {
  let hasMissingRate = false;
  const totalHkd = products.reduce((sum, product) => {
    const converted = convertToHkd(product.value, product.currency);
    if (converted == null) {
      hasMissingRate = true;
      return sum;
    }
    return sum + converted;
  }, 0);

  if (hasMissingRate) return "等待汇率";
  const baseTotal = fromHkd(totalHkd, state.baseCurrency);
  return baseTotal == null ? "等待汇率" : formatMoney(baseTotal, state.baseCurrency);
}

function toggleInvestmentInstitution(institutionId) {
  if (expandedInvestmentInstitutionIds.has(institutionId)) {
    expandedInvestmentInstitutionIds.delete(institutionId);
    revealingInvestmentInstitutionId = null;
  } else {
    expandedInvestmentInstitutionIds.add(institutionId);
    revealingInvestmentInstitutionId = institutionId;
  }
  renderInvestmentTable();
}

function updateInvestmentGroupTotal(institutionId) {
  const group = getInvestmentInstitutionGroups().find((item) => item.id === institutionId);
  const row = elements.investmentTableBody.querySelector(
    `.investment-group-row[data-institution-id="${CSS.escape(institutionId)}"]`,
  );
  if (!group || !row) return;
  row.querySelector(".group-total").textContent = group.totalText;
}

function formatBalanceList(balances) {
  const entries = Object.entries(balances).filter(([, amount]) => normalizeAmount(amount) !== 0);
  if (!entries.length) return `<span class="balance-chip muted">未录入余额</span>`;
  return entries
    .map(([currency, amount]) => {
      return `<button class="balance-chip" type="button" data-currency="${currency}" title="点击修改金额">${formatMoney(amount, currency)}</button>`;
    })
    .join("");
}

function startInlineBalanceEdit(chip) {
  const row = chip.closest("tr");
  const bank = state.banks.find((item) => item.id === row?.dataset.bankId);
  const currency = chip.dataset.currency;
  if (!bank || !currency) return;

  const input = document.createElement("input");
  input.className = "balance-inline-input";
  input.type = "number";
  input.step = "1";
  input.inputMode = "decimal";
  input.value = formatPlainAmount(bank.balances[currency]);
  input.setAttribute("aria-label", `${currency} 余额`);

  const save = () => {
    bank.balances[currency] = normalizeAmount(input.value);
    persist();
    renderSummary();
    renderBankTable();
  };

  input.addEventListener("blur", save, { once: true });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") renderBankTable();
  });

  chip.replaceWith(input);
  input.focus();
  input.select();
}

function renderRowTotal(row, balances) {
  const totalHkd = toHkd(balances);
  const baseTotal = fromHkd(totalHkd, state.baseCurrency);
  row.querySelector(".row-total").textContent = baseTotal == null
    ? "等待汇率"
    : formatMoney(baseTotal, state.baseCurrency);
}

function renderInvestmentRowTotal(row, product) {
  const totalHkd = convertToHkd(product.value, product.currency);
  const baseTotal = fromHkd(totalHkd, state.baseCurrency);
  row.querySelector(".row-total").textContent = baseTotal == null
    ? "等待汇率"
    : formatMoney(baseTotal, state.baseCurrency);
}

function renderRateChart() {
  syncRateHistoryFromStorage();
  const canvas = elements.rateChart;
  const context = canvas.getContext("2d");
  const series = getVisibleRateSeries(state.rateHistory[state.chartCurrency] || []);
  const latest = series[series.length - 1];
  const first = series[0];

  elements.chartRange.textContent =
    first && latest ? `${formatChartDate(first.date)} - ${formatChartDate(latest.date)}` : "暂无数据";
  elements.chartLatest.textContent = latest
    ? `${state.chartCurrency}/HKD ${formatRateLabel(latest.rate)} ${formatRateChange(series)}`
    : "--";

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const pixelRatio = window.devicePixelRatio || 1;

  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const chartColors = getChartColors();

  const padding = { top: 18, right: 14, bottom: 28, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  context.strokeStyle = chartColors.grid;
  context.lineWidth = 1;
  context.beginPath();
  for (let index = 0; index < 4; index += 1) {
    const y = padding.top + (plotHeight / 3) * index;
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
  }
  context.stroke();

  if (series.length < 2) {
    chartRenderState = { points: [], plot: null };
    hideChartTooltip({ skipRender: true });
    context.fillStyle = chartColors.text;
    context.font = "700 13px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("暂无历史数据", width / 2, height / 2);
    return;
  }

  const values = series.map((entry) => entry.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || max * 0.001 || 1;
  const yMin = min - range * 0.12;
  const yMax = max + range * 0.12;

  const points = series.map((entry, index) => {
    const x = padding.left + (plotWidth * index) / (series.length - 1);
    const y = padding.top + ((yMax - entry.rate) / (yMax - yMin)) * plotHeight;
    return { x, y, ...entry };
  });
  chartRenderState = {
    points,
    plot: {
      left: padding.left,
      right: width - padding.right,
      top: padding.top,
      bottom: padding.top + plotHeight,
    },
  };

  context.fillStyle = chartColors.text;
  context.font = "700 11px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText(formatRateLabel(yMax), 8, padding.top + 4);
  context.fillText(formatRateLabel(yMin), 8, padding.top + plotHeight);

  context.textAlign = "center";
  context.fillText(formatChartDate(first.date), padding.left + 10, height - 8);
  context.fillText(formatChartDate(latest.date), width - padding.right - 28, height - 8);

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = chartColors.line;
  context.lineWidth = 2.5;
  context.stroke();

  const activePoint = chartHoverPoint
    ? points.find((point) => point.date === chartHoverPoint.date)
    : null;
  if (activePoint) {
    drawChartHover(context, activePoint, padding, plotHeight, chartColors);
  }

  const lastPoint = points[points.length - 1];
  context.beginPath();
  context.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2);
  context.fillStyle = chartColors.surface;
  context.fill();
  context.strokeStyle = chartColors.line;
  context.lineWidth = 2;
  context.stroke();
}

function getChartColors() {
  return {
    grid: getCssVar("--chart-grid"),
    line: getCssVar("--chart-line"),
    text: getCssVar("--chart-text"),
    surface: getCssVar("--surface"),
    accentStrong: getCssVar("--accent-strong"),
  };
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawChartHover(context, point, padding, plotHeight, colors) {
  context.save();
  context.beginPath();
  context.moveTo(point.x, padding.top);
  context.lineTo(point.x, padding.top + plotHeight);
  context.strokeStyle = colors.line;
  context.globalAlpha = 0.36;
  context.lineWidth = 1;
  context.setLineDash([4, 4]);
  context.stroke();
  context.globalAlpha = 1;
  context.setLineDash([]);

  context.beginPath();
  context.arc(point.x, point.y, 5, 0, Math.PI * 2);
  context.fillStyle = colors.surface;
  context.fill();
  context.strokeStyle = colors.accentStrong;
  context.lineWidth = 2.5;
  context.stroke();
  context.restore();
}

function handleChartPointerMove(event) {
  const { points, plot } = chartRenderState;
  if (!points.length || !plot) {
    hideChartTooltip({ skipRender: true });
    return;
  }

  const rect = elements.rateChart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  if (x < plot.left - 10 || x > plot.right + 10) {
    hideChartTooltip();
    return;
  }

  const nearest = points.reduce((closest, point) => {
    return Math.abs(point.x - x) < Math.abs(closest.x - x) ? point : closest;
  }, points[0]);
  const previousDate = chartHoverPoint?.date;
  chartHoverPoint = nearest;
  if (previousDate !== nearest.date) renderRateChart();
  showChartTooltip(nearest);
}

function showChartTooltip(point) {
  const tooltip = elements.chartTooltip;
  const plot = chartRenderState.plot;
  if (!tooltip || !plot) return;

  tooltip.hidden = false;
  tooltip.innerHTML = `
    <strong>${formatChartTooltipDate(point.date)}</strong>
    <span>${state.chartCurrency}/HKD ${formatRateLabel(point.rate)}</span>
  `;

  const maxLeft = plot.right - 92;
  const left = Math.min(Math.max(point.x, plot.left + 92), maxLeft);
  const top = Math.max(8, point.y - 62);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideChartTooltip(options = {}) {
  if (elements.chartTooltip) elements.chartTooltip.hidden = true;
  if (!chartHoverPoint) return;
  chartHoverPoint = null;
  if (!options.skipRender) renderRateChart();
}

function syncRateHistoryFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const savedSeries = saved?.rateHistory?.[state.chartCurrency];
    const currentSeries = state.rateHistory[state.chartCurrency] || [];
    const savedFirst = savedSeries?.[0]?.date;
    const savedLast = savedSeries?.[savedSeries.length - 1]?.date;
    const currentFirst = currentSeries?.[0]?.date;
    const currentLast = currentSeries?.[currentSeries.length - 1]?.date;
    if (
      Array.isArray(savedSeries) &&
      (savedSeries.length !== currentSeries.length ||
        savedFirst !== currentFirst ||
        savedLast !== currentLast)
    ) {
      state.rateHistory[state.chartCurrency] = normalizeRateHistory({
        [state.chartCurrency]: savedSeries,
      })[state.chartCurrency];
    }
  } catch {
    // Local storage sync is a best-effort guard for async chart refreshes.
  }
}

function getVisibleRateSeries(series) {
  const range = CHART_RANGES.find((item) => item.key === state.chartRange) || CHART_RANGES[1];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - range.days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const visible = series.filter((entry) => entry.date >= cutoffDate);
  return visible.length >= 2 ? visible : series.slice(-Math.min(series.length, range.days + 1));
}

function calculateCurrencyTotals() {
  const totals = state.currencies.reduce((result, currency) => {
    result[currency.code] = 0;
    return result;
  }, {});

  state.banks.forEach((bank) => {
    Object.entries(bank.balances).forEach(([code, amount]) => {
      totals[code] = normalizeAmount(totals[code]) + normalizeAmount(amount);
    });
  });

  state.investmentProducts.forEach((product) => {
    totals[product.currency] =
      normalizeAmount(totals[product.currency]) + normalizeAmount(product.value);
  });

  return totals;
}

function toHkd(balances) {
  let hasMissingRate = false;
  const total = Object.entries(balances).reduce((sum, [currency, amount]) => {
    if (normalizeAmount(amount) === 0) return sum;
    const converted = convertToHkd(amount, currency);
    if (converted == null) {
      hasMissingRate = true;
      return sum;
    }
    return sum + converted;
  }, 0);
  return hasMissingRate ? null : total;
}

function convertToHkd(amount, currency) {
  const rate = getRateToHkd(currency);
  if (!rate) return null;
  return normalizeAmount(amount) * rate;
}

function fromHkd(amount, currency) {
  if (amount == null) return null;
  const rate = getRateToHkd(currency);
  if (!rate) return null;
  return amount / rate;
}

function convertCurrency(amount, fromCurrency, toCurrency) {
  const hkdAmount = convertToHkd(amount, fromCurrency);
  return fromHkd(hkdAmount, toCurrency);
}

function getRateToHkd(currency) {
  if (currency === "HKD") return 1;
  const rate = normalizeAmount(state.ratesToHkd[currency]);
  return rate > 0 ? rate : null;
}

function getRateCurrencies() {
  return state.currencies.filter((currency) => currency.code !== "HKD");
}

function getFetchRateCurrencies() {
  const byCode = new Map();
  getRateCurrencies().forEach((currency) => byCode.set(currency.code, currency));
  CONVERTER_CURRENCIES.forEach((currency) => {
    if (currency.code !== "HKD") byCode.set(currency.code, createCurrency(currency.code, currency.label));
  });
  return [...byCode.values()];
}

function isConverterCurrency(code) {
  return CONVERTER_CURRENCIES.some((currency) => currency.code === code);
}

function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatPlainAmount(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatConverterAmount(value) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  const amount = normalizeAmount(value);
  if (Number.isInteger(amount)) return String(amount);
  return String(Number(amount.toFixed(2)));
}

function formatRateLabel(value) {
  return Number(value || 0).toFixed(4);
}

function formatRateChange(series) {
  if (series.length < 2) return "";
  const first = series[0].rate;
  const latest = series[series.length - 1].rate;
  if (!first) return "";
  const change = ((latest - first) / first) * 100;
  const sign = change > 0 ? "+" : "";
  return `(${sign}${change.toFixed(2)}%)`;
}

function getRateStatusText() {
  if (isRefreshingRates) return "正在更新实时汇率...";
  if (state.rateMeta.updatedAt) {
    const sourceDate = state.rateMeta.sourceDate ? ` · 数据 ${state.rateMeta.sourceDate}` : "";
    return `Frankfurter${sourceDate} · 更新 ${formatLocalTime(state.rateMeta.updatedAt)}`;
  }
  return "打开页面后会自动获取实时汇率。";
}

function formatLocalTime(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("zh-Hans-HK", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getIsoDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatChartDate(value) {
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return state.chartRange === "year" ? `${year}/${month}/${day}` : `${month}/${day}`;
}

function formatChartTooltipDate(value) {
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${year}/${month}/${day}`;
}

function formatMoney(value, currencyCode) {
  const currency = state.currencies.find((item) => item.code === currencyCode);
  const symbol = currency?.symbol || `${currencyCode} `;
  const formatter = new Intl.NumberFormat("zh-Hans-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${symbol}${formatter.format(normalizeAmount(value))}`;
}

function exportLedger() {
  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `money-ledger-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("数据已导出");
}

async function importLedger(event) {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const importedState = parsed.data || parsed;
    state = migrateImportedState(importedState);
    persist();
    render();
    showToast("数据已导入");
    refreshExchangeRates({ silent: true });
  } catch {
    showToast("导入失败，请检查 JSON 文件");
  } finally {
    event.target.value = "";
  }
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function createId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.append(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}
