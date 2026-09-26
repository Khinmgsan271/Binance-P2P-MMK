/* =========================================================
   BINANCE P2P MMK  —  shared.js
   Cross-page utilities: number formatting, theme, dates,
   history storage. Loaded by every page before its own
   script, so the three pages behave identically.
========================================================= */

"use strict";

const HISTORY_KEY = "p2pMmkDailyHistory";
const IMPORT_SELECTION_KEY = "p2pMmkImportedSelection";
const THEME_KEY = "p2pMmkTheme";
const CHART_KEY = "p2pMmkChartRange";
const APP_VERSION = "4.0.0";


/* =========================================================
   NUMBERS
========================================================= */

function num(value) {
    const n = Number(String(value ?? "").replace(/,/g, "").trim());

    return Number.isFinite(n) ? n : 0;
}

function money(value) {
    return `${num(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} MMK`;
}

function usdt(value) {
    return `${num(value).toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6
    })} USDT`;
}

function shortMoney(value) {
    return num(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function compactMoney(value) {
    const n = num(value);
    const abs = Math.abs(n);

    if (abs >= 10000000) return `${(n / 1000000).toFixed(1)}M`;
    if (abs >= 100000) return `${(n / 1000).toFixed(0)}K`;
    if (abs >= 10000) return `${(n / 1000).toFixed(1)}K`;

    return shortMoney(n);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   THEME
========================================================= */

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);

    const btn = document.getElementById("themeBtn");

    if (btn) {
        btn.setAttribute(
            "aria-label",
            theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        );
    }
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
            /* storage unavailable — theme still applies for this session */
        }
    });
}


/* =========================================================
   DATES
========================================================= */

function todayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);

    return local.toISOString().slice(0, 10);
}

function setToday() {
    const field = document.getElementById("date");
    if (field) field.value = todayISO();
}

function formatDateLabel(iso) {
    if (!iso) return "Today";

    const parsed = new Date(`${iso}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) return iso;

    return parsed.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function shortDayLabel(iso) {
    if (!iso) return "";

    const parsed = new Date(`${iso}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) return iso;

    return parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short"
    });
}

function monthLabel(iso) {
    if (!iso) return "";

    const parsed = new Date(`${iso}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) return iso;

    return parsed.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric"
    });
}


/* =========================================================
   MESSAGE
========================================================= */

let messageTimer = null;

function showMessage(message, type = "success", boxId = "message") {
    const box = document.getElementById(boxId);
    if (!box) return;

    box.textContent = message;
    box.className = `message ${type}`;

    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => hideMessage(boxId), 4500);
}

function hideMessage(boxId = "message") {
    const box = document.getElementById(boxId);
    if (!box) return;

    box.className = "message hidden";
}


/* =========================================================
   HISTORY STORAGE
========================================================= */

function getHistory() {
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");

        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveHistory(history) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

        return true;
    } catch {
        showMessage(
            "Could not save to this browser's storage — it may be full or disabled.",
            "error"
        );

        return false;
    }
}

function sortHistory(history) {
    return history.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/* rows saved by earlier versions carry no buyingRate — derive it */

function buyingRateOf(item) {
    const stored = num(item.buyingRate);

    if (stored > 0) return stored;

    const mmk = num(item.totalMmk);
    const receive = num(item.receiveQuantity);

    if (mmk > 0 && receive > 0) return mmk / receive;

    return 0;
}


/* =========================================================
   CSV DOWNLOAD
========================================================= */

function downloadCSV(filename, headers, rows) {
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
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}
