/* =========================================================
   BINANCE P2P MMK  —  import.js
   Reads Binance P2P Excel / CSV / image exports, aggregates
   transactions per day + order type, and hands a selected
   day to the dashboard through localStorage.

   FEE RULE
     Maker Fee + Taker Fee   when either column exists
     Fee / Commission        otherwise

   RECEIVE RULE
     Receive USDT = Total USDT − Fee
========================================================= */

"use strict";

const IMPORT_SELECTION_KEY = "p2pMmkImportedSelection";
const THEME_KEY = "p2pMmkTheme";

let importedDaily = [];
let currentOcrData = null;
let importMessageTimer = null;


/* =========================================================
   BASIC HELPERS
========================================================= */

function num(value) {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    let text = String(value)
        .trim()
        .replace(/\u00a0/g, " ")
        .replace(/,/g, "");

    /* strip currency symbols and stray markers */

    text = text
        .replace(/(?:MMK|USDT|USD|KYAT|K)/gi, "")
        .replace(/[$₿]/g, "")
        .replace(/[^\d.\-+eE]/g, "")
        .trim();

    if (text === "" || text === "-" || text === ".") return 0;

    const n = Number(text);

    return Number.isFinite(n) ? n : 0;
}

function normalizeKey(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[\s_\-\/()[\].]+/g, "");
}

function findKey(sample, names) {
    const keys = Object.keys(sample || {});

    const normalized = keys.map((key) => ({
        original: key,
        normalized: normalizeKey(key)
    }));

    for (const name of names) {
        const target = normalizeKey(name);

        const exact = normalized.find((item) => item.normalized === target);

        if (exact) return exact.original;
    }

    for (const name of names) {
        const target = normalizeKey(name);

        const partial = normalized.find((item) =>
            item.normalized.includes(target)
        );

        if (partial) return partial.original;
    }

    return null;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function usdt(value) {
    return num(value).toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6
    });
}


/* =========================================================
   THEME
========================================================= */

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
}

function initTheme() {
    let saved = null;

    try {
        saved = localStorage.getItem(THEME_KEY);
    } catch {
        saved = null;
    }

    if (!saved) {
        saved = window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    applyTheme(saved);

    const btn = document.getElementById("themeBtn");
    if (!btn) return;

    btn.addEventListener("click", () => {
        const next =
            document.documentElement.getAttribute("data-theme") === "dark"
                ? "light"
                : "dark";

        applyTheme(next);

        try {
            localStorage.setItem(THEME_KEY, next);
        } catch {
            /* ignore */
        }
    });
}


/* =========================================================
   DATE
========================================================= */

function isoFromParts(year, month, day) {
    const y = String(year).padStart(4, "0");
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");

    const probe = new Date(`${y}-${m}-${d}T00:00:00`);

    if (Number.isNaN(probe.getTime())) return "";

    return `${y}-${m}-${d}`;
}

function parseDate(value) {
    if (!value) return "";

    if (value instanceof Date) {
        if (!Number.isNaN(value.getTime())) {
            const local = new Date(
                value.getTime() - value.getTimezoneOffset() * 60000
            );

            return local.toISOString().slice(0, 10);
        }

        return "";
    }

    const text = String(value).trim();
    if (!text) return "";

    /* YYYY-MM-DD or YYYY/MM/DD */

    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

    if (match) {
        return isoFromParts(match[1], match[2], match[3]);
    }

    /* DD/MM/YYYY or DD-MM-YYYY */

    match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);

    if (match) {
        return isoFromParts(match[3], match[2], match[1]);
    }

    /* "12 Jun 2025" / "Jun 12, 2025" */

    const parsed = new Date(text);

    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return "";
}


/* =========================================================
   TYPE + STATUS
========================================================= */

function normalizeType(value) {
    const text = String(value ?? "").trim().toUpperCase();

    if (text.includes("SELL")) return "SELL";
    if (text.includes("BUY")) return "BUY";

    return text || "UNKNOWN";
}

function validStatus(value) {
    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
    ) {
        return true;
    }

    const status = String(value).trim().toLowerCase();

    return [
        "completed",
        "complete",
        "success",
        "successful",
        "filled",
        "done",
        "paid"
    ].includes(status);
}


/* =========================================================
   AGGREGATION
========================================================= */

function aggregateRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { daily: [], stats: { rows: 0, used: 0, skipped: 0 } };
    }

    const sample = rows.find(
        (row) => row && Object.keys(row).length > 0
    );

    if (!sample) {
        return { daily: [], stats: { rows: 0, used: 0, skipped: 0 } };
    }

    const typeKey = findKey(sample, ["Order Type", "Type", "Side", "OrderType"]);

    const assetKey = findKey(sample, ["Asset", "Coin", "Crypto", "Currency"]);

    const quantityKey = findKey(sample, [
        "Quantity",
        "Amount",
        "Total Quantity",
        "Executed Quantity"
    ]);

    const makerFeeKey = findKey(sample, ["Maker Fee", "MakerFee", "Maker Commission"]);

    const takerFeeKey = findKey(sample, ["Taker Fee", "TakerFee", "Taker Commission"]);

    const genericFeeKey = findKey(sample, ["Fee", "Commission", "Transaction Fee"]);

    const priceKey = findKey(sample, ["Price", "Unit Price", "Order Price"]);

    const totalPriceKey = findKey(sample, ["Total Price", "Total", "Amount"]);

    const dateKey = findKey(sample, [
        "Created Time",
        "Create Time",
        "Time",
        "Date",
        "CreatedTime",
        "Order Time"
    ]);

    const statusKey = findKey(sample, ["Status", "Order Status"]);

    const grouped = new Map();

    let used = 0;
    let skipped = 0;

    rows.forEach((row) => {
        if (!row) {
            skipped += 1;
            return;
        }

        if (statusKey && !validStatus(row[statusKey])) {
            skipped += 1;
            return;
        }

        /* only USDT when an asset column exists */

        if (assetKey) {
            const asset = String(row[assetKey] ?? "").trim().toUpperCase();

            if (asset && asset !== "USDT") {
                skipped += 1;
                return;
            }
        }

        const date = parseDate(dateKey ? row[dateKey] : "");

        if (!date) {
            skipped += 1;
            return;
        }

        const type = normalizeType(typeKey ? row[typeKey] : "");

        /* quantity, with Total / Price as a fallback */

        let quantity = quantityKey ? num(row[quantityKey]) : 0;

        if (quantity <= 0 && totalPriceKey && priceKey) {
            const totalPrice = num(row[totalPriceKey]);
            const price = num(row[priceKey]);

            if (price > 0) {
                quantity = totalPrice / price;
            }
        }

        if (quantity <= 0) {
            skipped += 1;
            return;
        }

        /* fees: maker + taker when either exists, else generic */

        let fee = 0;

        if (makerFeeKey || takerFeeKey) {
            fee =
                (makerFeeKey ? num(row[makerFeeKey]) : 0) +
                (takerFeeKey ? num(row[takerFeeKey]) : 0);
        } else if (genericFeeKey) {
            fee = num(row[genericFeeKey]);
        }

        fee = Math.max(fee, 0);

        const receive = Math.max(quantity - fee, 0);

        const price = priceKey ? num(row[priceKey]) : 0;

        const key = `${date}|${type}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                date,
                type,
                totalUsdt: 0,
                totalFee: 0,
                receiveUsdt: 0,
                priceWeightedTotal: 0,
                orders: 0
            });
        }

        const group = grouped.get(key);

        group.totalUsdt += quantity;
        group.totalFee += fee;
        group.receiveUsdt += receive;
        group.priceWeightedTotal += quantity * price;
        group.orders += 1;

        used += 1;
    });

    const daily = Array.from(grouped.values())
        .map((group) => ({
            date: group.date,
            type: group.type,
            totalUsdt: group.totalUsdt,
            totalFee: group.totalFee,
            receiveUsdt: group.receiveUsdt,
            avgPrice:
                group.totalUsdt > 0
                    ? group.priceWeightedTotal / group.totalUsdt
                    : 0,
            orders: group.orders
        }))
        .sort((a, b) => {
            if (a.date !== b.date) {
                return b.date.localeCompare(a.date);
            }

            return a.type.localeCompare(b.type);
        });

    return {
        daily,
        stats: { rows: rows.length, used, skipped }
    };
}


/* =========================================================
   DISPLAY
========================================================= */

function renderImportedDaily() {
    const body = document.getElementById("importBody");
    if (!body) return;

    body.innerHTML = "";

    const summary = document.getElementById("importSummary");

    if (importedDaily.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="8" class="empty">
                    No imported data yet — choose a file above.
                </td>
            </tr>
        `;

        if (summary) summary.textContent = "Import a Binance file to begin.";

        return;
    }

    if (summary) {
        summary.textContent =
            `${importedDaily.length} daily group(s) ready. Press Use Day to send one to the calculator.`;
    }

    const fragment = document.createDocumentFragment();

    importedDaily.forEach((item, index) => {
        const row = document.createElement("tr");

        const typeClass =
            item.type === "SELL" ? "sell" : item.type === "BUY" ? "buy" : "";

        row.innerHTML = `
            <td>${escapeHtml(item.date)}</td>
            <td><span class="type-badge ${typeClass}">${escapeHtml(item.type)}</span></td>
            <td class="num">${usdt(item.totalUsdt)}</td>
            <td class="num">${usdt(item.totalFee)}</td>
            <td class="num">${usdt(item.receiveUsdt)}</td>
            <td class="num">${num(item.avgPrice).toFixed(2)}</td>
            <td class="num">${item.orders}</td>
            <td class="num">
                <div class="row-actions">
                    <button
                        type="button"
                        class="btn success small-btn"
                        data-use="${index}"
                    >
                        Use Day
                    </button>
                </div>
            </td>
        `;

        fragment.appendChild(row);
    });

    body.appendChild(fragment);
}


/* =========================================================
   HANDOFF TO DASHBOARD
========================================================= */

function useImportedDay(index) {
    const item = importedDaily[index];
    if (!item) return;

    try {
        localStorage.setItem(
            IMPORT_SELECTION_KEY,
            JSON.stringify({
                date: item.date,
                type: item.type,
                totalUsdt: item.totalUsdt,
                totalFee: item.totalFee,
                receiveUsdt: item.receiveUsdt,
                avgPrice: item.avgPrice,
                orders: item.orders
            })
        );
    } catch {
        showImportMessage(
            "Could not pass the day to the dashboard — browser storage is unavailable.",
            "error"
        );

        return;
    }

    window.location.href = "index.html";
}


/* =========================================================
   FILE READING
========================================================= */

function readSpreadsheet(file) {
    if (typeof XLSX === "undefined") {
        showImportMessage(
            "The spreadsheet reader did not load. Check your connection and reload.",
            "error"
        );

        return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
        try {
            const data = new Uint8Array(event.target.result);

            const workbook = XLSX.read(data, {
                type: "array",
                cellDates: true
            });

            const rows = [];

            workbook.SheetNames.forEach((sheetName) => {
                const sheet = workbook.Sheets[sheetName];

                const sheetRows = XLSX.utils.sheet_to_json(sheet, {
                    defval: "",
                    raw: false
                });

                rows.push(...sheetRows);
            });

            const { daily, stats } = aggregateRows(rows);

            importedDaily = daily;

            renderImportedDaily();

            if (importedDaily.length === 0) {
                showImportMessage(
                    `Read ${stats.rows} row(s) but could not build any daily group. ` +
                    `Check that the file has date, quantity and price columns.`,
                    "error"
                );

                return;
            }

            showImportMessage(
                `Read ${stats.rows} row(s) → ${importedDaily.length} daily group(s). ` +
                `${stats.used} row(s) used, ${stats.skipped} skipped.`,
                "success"
            );

        } catch (error) {
            console.error(error);

            showImportMessage(
                "Could not read this file. Make sure it is a valid Binance export.",
                "error"
            );
        }
    };

    reader.onerror = () => {
        showImportMessage("Could not open the file.", "error");
    };

    reader.readAsArrayBuffer(file);
}


/* =========================================================
   MESSAGE
========================================================= */

function showImportMessage(message, type = "success") {
    const box = document.getElementById("importMessage");
    if (!box) return;

    box.textContent = message;
    box.className = `message ${type}`;

    clearTimeout(importMessageTimer);
    importMessageTimer = setTimeout(() => {
        box.className = "message hidden";
    }, 6000);
}


/* =========================================================
   OCR
========================================================= */

async function readImage(file) {
    const section = document.getElementById("ocrSection");
    const status = document.getElementById("ocrStatus");
    const progress = document.getElementById("ocrProgress");
    const resultBox = document.getElementById("ocrResult");
    const useButton = document.getElementById("useOcrBtn");

    section.classList.remove("hidden");
    useButton.classList.add("hidden");

    currentOcrData = null;

    if (typeof Tesseract === "undefined") {
        status.textContent = "The image reader did not load.";
        showImportMessage(
            "Could not load the OCR engine. Check your connection and reload.",
            "error"
        );

        return;
    }

    status.textContent = "Reading image…";
    progress.style.width = "0%";
    resultBox.innerHTML = "";

    try {
        const result = await Tesseract.recognize(file, "eng", {
            logger: (message) => {
                if (message.status === "recognizing text") {
                    const percent = Math.round((message.progress || 0) * 100);

                    progress.style.width = `${percent}%`;
                    status.textContent = `Reading image… ${percent}%`;
                } else {
                    status.textContent = message.status;
                }
            }
        });

        progress.style.width = "100%";

        const text = result.data.text;

        currentOcrData = parseOcrText(text);

        displayOcrResult(currentOcrData, text);

        useButton.classList.remove("hidden");

    } catch (error) {
        console.error(error);

        status.textContent = "OCR failed.";
        showImportMessage("Could not read the image.", "error");
    }
}

function resetOcr() {
    const section = document.getElementById("ocrSection");

    currentOcrData = null;

    section.classList.add("hidden");

    document.getElementById("ocrResult").innerHTML = "";
    document.getElementById("ocrProgress").style.width = "0%";
    document.getElementById("imageInput").value = "";
}


/* =========================================================
   OCR PARSER
========================================================= */

function extractNumberAfterLabel(text, labels) {
    for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const regex = new RegExp(
            `${escaped}\\s*[:=]?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)`,
            "i"
        );

        const match = text.match(regex);

        if (match) {
            return num(match[1]);
        }
    }

    return 0;
}

function extractDateFromText(text) {
    const patterns = [
        /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/,
        /(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);

        if (match) {
            const parsed = parseDate(match[1]);

            if (parsed) return parsed;
        }
    }

    return "";
}

function parseOcrText(text) {
    const totalQuantity = extractNumberAfterLabel(text, [
        "Total Quantity",
        "Quantity",
        "Amount"
    ]);

    const fee = extractNumberAfterLabel(text, [
        "Transaction Fee",
        "Maker Fee",
        "Taker Fee",
        "Fee"
    ]);

    const receiveQuantity = extractNumberAfterLabel(text, [
        "Receive Quantity",
        "Received Quantity",
        "You Receive"
    ]);

    const price = extractNumberAfterLabel(text, ["Price", "Rate", "Unit Price"]);

    const date = extractDateFromText(text);

    let finalReceive = receiveQuantity;

    if (finalReceive <= 0 && totalQuantity > 0) {
        finalReceive = Math.max(totalQuantity - fee, 0);
    }

    return {
        date,
        totalUsdt: totalQuantity,
        fee,
        receiveUsdt: finalReceive,
        avgPrice: price
    };
}

function displayOcrResult(data, originalText) {
    const status = document.getElementById("ocrStatus");
    const resultBox = document.getElementById("ocrResult");

    status.textContent = "OCR completed — check the values before using them.";

    resultBox.innerHTML = `
        <div class="ocr-grid">
            <div>
                <span>Date</span>
                <strong>${escapeHtml(data.date || "Not found")}</strong>
            </div>
            <div>
                <span>Total Quantity</span>
                <strong>${usdt(data.totalUsdt)} USDT</strong>
            </div>
            <div>
                <span>Fee</span>
                <strong>${usdt(data.fee)} USDT</strong>
            </div>
            <div>
                <span>Receive Quantity</span>
                <strong>${usdt(data.receiveUsdt)} USDT</strong>
            </div>
            <div>
                <span>Rate</span>
                <strong>${num(data.avgPrice).toFixed(2)} MMK</strong>
            </div>
        </div>

        <details>
            <summary>Show raw OCR text</summary>
            <pre>${escapeHtml(originalText)}</pre>
        </details>
    `;
}

function useOcrData() {
    if (!currentOcrData) return;

    if (!currentOcrData.date || currentOcrData.totalUsdt <= 0) {
        showImportMessage(
            "The image did not contain a readable date and quantity. Try a clearer screenshot.",
            "error"
        );

        return;
    }

    try {
        localStorage.setItem(
            IMPORT_SELECTION_KEY,
            JSON.stringify({
                date: currentOcrData.date,
                type: "SELL",
                totalUsdt: currentOcrData.totalUsdt,
                totalFee: currentOcrData.fee,
                receiveUsdt: currentOcrData.receiveUsdt,
                avgPrice: currentOcrData.avgPrice,
                orders: 1
            })
        );
    } catch {
        showImportMessage(
            "Could not pass the data to the dashboard — browser storage is unavailable.",
            "error"
        );

        return;
    }

    window.location.href = "index.html";
}


/* =========================================================
   IMPORT TABLE TOOLS
========================================================= */

function exportImportedCSV() {
    if (importedDaily.length === 0) {
        showImportMessage("There is nothing to export yet.", "error");
        return;
    }

    const headers = [
        "Date",
        "Type",
        "Total USDT",
        "Fee USDT",
        "Receive USDT",
        "Average Price MMK",
        "Orders"
    ];

    const rows = importedDaily.map((item) => [
        item.date,
        item.type,
        item.totalUsdt,
        item.totalFee,
        item.receiveUsdt,
        item.avgPrice,
        item.orders
    ]);

    const csv = [headers, ...rows]
        .map((row) =>
            row
                .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
                .join(",")
        )
        .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "binance_p2p_daily_groups.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showImportMessage("Daily groups exported to CSV.", "success");
}

function clearImportedTable() {
    if (importedDaily.length === 0) {
        showImportMessage("The table is already empty.", "error");
        return;
    }

    importedDaily = [];

    renderImportedDaily();

    document.getElementById("excelInput").value = "";
    document.getElementById("csvInput").value = "";

    showImportMessage("Imported table cleared.", "success");
}


/* =========================================================
   EVENTS
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    const excelBtn = document.getElementById("excelBtn");
    const excelInput = document.getElementById("excelInput");
    const csvBtn = document.getElementById("csvBtn");
    const csvInput = document.getElementById("csvInput");
    const imageBtn = document.getElementById("imageBtn");
    const imageInput = document.getElementById("imageInput");
    const useOcrBtn = document.getElementById("useOcrBtn");

    excelBtn.addEventListener("click", () => excelInput.click());
    csvBtn.addEventListener("click", () => csvInput.click());
    imageBtn.addEventListener("click", () => imageInput.click());

    excelInput.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) readSpreadsheet(file);
    });

    csvInput.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) readSpreadsheet(file);
    });

    imageInput.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) readImage(file);
    });

    useOcrBtn.addEventListener("click", useOcrData);

    document
        .getElementById("resetOcrBtn")
        .addEventListener("click", resetOcr);

    document
        .getElementById("exportImportBtn")
        .addEventListener("click", exportImportedCSV);

    document
        .getElementById("clearImportBtn")
        .addEventListener("click", clearImportedTable);

    /* row actions (delegated) */

    document.getElementById("importBody").addEventListener("click", (event) => {
        const target = event.target.closest("button[data-use]");
        if (!target) return;

        useImportedDay(Number(target.dataset.use));
    });

    /* drag and drop anywhere on the page */

    document.addEventListener("dragover", (event) => {
        event.preventDefault();
    });

    document.addEventListener("drop", (event) => {
        event.preventDefault();

        const file = event.dataTransfer?.files?.[0];
        if (!file) return;

        if (file.type.startsWith("image/")) {
            readImage(file);
            return;
        }

        if (/\.(xlsx|xls|csv|txt)$/i.test(file.name)) {
            readSpreadsheet(file);
        }
    });
});
