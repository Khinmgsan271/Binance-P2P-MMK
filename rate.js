/* =========================================================
   BINANCE P2P MMK  —  rate.js
   Header rate ticker. Re-reads the saved rate every minute.

   Three ways the rate can reach the page, tried in order:

     1. data/rates.json          (needs the folder served over http://)
     2. data/rates-data.js       (works from file:// — a script tag can
                                  load local files where fetch() cannot)
     3. a rate pasted in by hand (stored in localStorage)

   If none is present the ticker says "no rate yet" with the command to
   run — it never invents a number.
========================================================= */

"use strict";

const RATE_CACHE_KEY = "p2pMmkRateCache";
const RATE_FILE = "data/rates.json";
const RATE_FALLBACK_FILE = "data/rates-data.js";

const RATE_REFRESH_MS = 60000;

let rateTimer = null;
let lastGoodStamp = null;
let manualRate = null;

/* ---------------------------------------------------------------- shapes */

function looksLikeRate(data) {
    return !!(
        data &&
        typeof data === "object" &&
        (data.dailyRate || data.buy || data.sell)
    );
}

function readStoredRate() {
    try {
        return JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null");
    } catch {
        return null;
    }
}

function storeRate(data) {
    try {
        localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(data));
    } catch {
        /* storage full or blocked — the ticker still renders */
    }
}

/* ---------------------------------------------------------------- sources */

async function tryJsonFile() {
    if (window.location.protocol === "file:") return null;

    try {
        const response = await fetch(`${RATE_FILE}?t=${Date.now()}`, {
            cache: "no-store"
        });

        if (!response.ok) return null;

        const data = await response.json();

        return looksLikeRate(data) ? data : null;
    } catch {
        return null;
    }
}

async function tryScriptFile() {
    /* A <script> tag loads local files even from file://, which fetch()
       is not allowed to do. data/rates-data.js simply assigns
       window.P2P_RATE_DATA. */

    if (window.P2P_RATE_DATA && looksLikeRate(window.P2P_RATE_DATA)) {
        return window.P2P_RATE_DATA;
    }

    return new Promise((resolve) => {
        const tag = document.createElement("script");

        const done = (value) => {
            tag.remove();
            resolve(value);
        };

        tag.src = `${RATE_FALLBACK_FILE}?t=${Date.now()}`;

        tag.onload = () =>
            done(looksLikeRate(window.P2P_RATE_DATA) ? window.P2P_RATE_DATA : null);
        tag.onerror = () => done(null);

        setTimeout(() => done(null), 4000);

        document.head.appendChild(tag);
    });
}

async function loadRates() {
    const fresh = (await tryJsonFile()) || (await tryScriptFile());

    if (fresh) {
        /* only adopt a fetched file if it is at least as recent as the
           hand-typed rate sitting in storage */

        if (
            manualRate &&
            manualRate.fetchedAt &&
            fresh.fetchedAt &&
            new Date(manualRate.fetchedAt) > new Date(fresh.fetchedAt)
        ) {
            return { data: manualRate, source: "manual" };
        }

        return { data: fresh, source: "file" };
    }

    if (manualRate) return { data: manualRate, source: "manual" };

    const cached = readStoredRate();

    if (looksLikeRate(cached)) return { data: cached, source: "cache" };

    return { data: null, source: null };
}

/* ---------------------------------------------------------------- stamp */

function rateAge(isoDate, isoStamp) {
    if (!isoDate) return "unknown";

    const fetched = new Date(`${isoDate}T00:00:00`);
    const today = new Date(`${todayISO()}T00:00:00`);

    if (Number.isNaN(fetched.getTime())) return "unknown";

    const days = Math.round((today - fetched) / 86400000);

    if (days <= 0) {
        const time = isoStamp ? String(isoStamp).slice(11, 16) : "";

        return time ? `today ${time} UTC` : "today";
    }

    if (days === 1) return "yesterday";

    return `${days} days ago`;
}

/* ---------------------------------------------------------------- render */

function renderRateTicker(payload) {
    const host = document.getElementById("rateTicker");
    if (!host) return;

    const { data, source } = payload;

    if (!data) {
        host.classList.add("is-empty");
        host.innerHTML = `
            <span class="rate-label">USDT / MMK</span>
            <span class="rate-value rate-none">no rate yet</span>
        `;
        host.title =
            "No rate saved yet.\n\n" +
            "Run:  python tools/update_rate.py\n" +
            "Or paste a rate by hand with the button on the right.";
        return;
    }

    host.classList.remove("is-empty");

    const parts = [];

    if (data.buy) {
        parts.push(`
            <span class="rate-side">
                <span class="rate-side-name">Buy</span>
                <span class="rate-side-value">${num(data.buy).toFixed(2)}</span>
            </span>
        `);
    }

    if (data.sell) {
        parts.push(`
            <span class="rate-side">
                <span class="rate-side-name">Sell</span>
                <span class="rate-side-value">${num(data.sell).toFixed(2)}</span>
            </span>
        `);
    }

    if (!parts.length) {
        parts.push(`
            <span class="rate-side">
                <span class="rate-side-value">${num(data.dailyRate).toFixed(2)}</span>
            </span>
        `);
    }

    const age = rateAge(data.fetchedDate, data.fetchedAt);
    const stale =
        source === "cache" || age === "unknown" || /days ago/.test(age);

    host.innerHTML = `
        <span class="rate-label">USDT / MMK</span>
        <span class="rate-sides">${parts.join("")}</span>
        ${source === "manual" ? '<span class="rate-source">manual</span>' : ""}
        <span class="rate-stamp ${stale ? "is-stale" : ""}">
            ${escapeHtml(age)}
        </span>
    `;

    host.title = [
        `Source: ${data.source || "p2p.binance.com"}`,
        source === "manual" ? "Entered by hand." : "",
        source === "cache" ? "Last saved reading." : "",
        data.mid ? `Midpoint: ${num(data.mid).toFixed(2)} MMK` : "",
        data.spread ? `Spread: ${num(data.spread).toFixed(2)} MMK` : "",
        data.fetchedAt ? `Fetched: ${data.fetchedAt}` : ""
    ]
        .filter(Boolean)
        .join("\n");
}

/* ---------------------------------------------------------------- manual */

function openManualRate() {
    const current = manualRate || readStoredRate() || {};

    const buy = prompt(
        "Buy rate — what you pay for 1 USDT (MMK).\nLeave blank to skip.",
        current.buy != null ? String(current.buy) : ""
    );

    if (buy === null) return;

    const sell = prompt(
        "Sell rate — what you get for 1 USDT (MMK).\nLeave blank to skip.",
        current.sell != null ? String(current.sell) : ""
    );

    if (sell === null) return;

    const buyValue = num(buy);
    const sellValue = num(sell);

    if (buyValue <= 0 && sellValue <= 0) {
        showMessage("Nothing entered — the rate was not changed.", "error");
        return;
    }

    const mid =
        buyValue > 0 && sellValue > 0 ? (buyValue + sellValue) / 2 : 0;

    const now = new Date();

    manualRate = {
        buy: buyValue || null,
        sell: sellValue || null,
        mid: mid || null,
        dailyRate: mid || buyValue || sellValue,
        fetchedDate: todayISO(),
        fetchedAt: now.toISOString().slice(0, 19),
        source: "entered by hand"
    };

    storeRate(manualRate);

    renderRateTicker({ data: manualRate, source: "manual" });

    showMessage(`Rate set by hand: ${manualRate.dailyRate.toFixed(2)} MMK.`, "success");
}

/* ---------------------------------------------------------------- entry */

async function refreshRateTicker() {
    const payload = await loadRates();

    if (payload.data) {
        const stamp = `${payload.source}|${payload.data.fetchedAt || ""}`;

        /* only re-render when the reading actually changed, so the
           minute-by-minute beat doesn't redraw the same numbers */

        if (stamp !== lastGoodStamp) {
            lastGoodStamp = stamp;

            if (payload.source !== "manual") storeRate(payload.data);
        }
    }

    renderRateTicker(payload);
}

async function initRateTicker() {
    const host = document.getElementById("rateTicker");
    if (!host) return;

    /* the cached/manual value renders immediately; the file, if any,
       replaces it a moment later */

    manualRate = readStoredRate();

    if (looksLikeRate(manualRate)) {
        renderRateTicker({ data: manualRate, source: "cache" });
    } else {
        host.innerHTML = `
            <span class="rate-label">USDT / MMK</span>
            <span class="rate-value rate-wait">…</span>
        `;
    }

    await refreshRateTicker();

    /* re-read the saved rate every minute */

    clearInterval(rateTimer);
    rateTimer = setInterval(refreshRateTicker, RATE_REFRESH_MS);

    /* and refresh straight away when the tab comes back to the front,
       so a page left open overnight isn't showing yesterday's reading */

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshRateTicker();
    });

    window.addEventListener("focus", refreshRateTicker);

    window.addEventListener("storage", (event) => {
        if (event.key === RATE_CACHE_KEY) refreshRateTicker();
    });

    /* the manual-entry button in the top bar */

    const button = document.getElementById("rateEditBtn");

    if (button) button.addEventListener("click", openManualRate);
}
