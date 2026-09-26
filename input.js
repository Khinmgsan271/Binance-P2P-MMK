/* =========================================================
   BINANCE P2P MMK  —  input.js
   New Entry page: the calculator, live preview, save,
   and the recent-days strip.

   FORMULA
     Receive Quantity = Total Quantity − Fee
     Spread           = Daily Rate  − P2P Rate
     Gross Profit     = Receive Quantity × Spread
     Fee Loss         = Fee × Spread
     Net Profit       = Gross Profit − Fee Loss

   BUY INPUT
     P2P Rate (derived) = Total MMK Paid ÷ Total Quantity
     Buying Rate        = Total MMK Paid ÷ Receive Quantity
========================================================= */

"use strict";

const $ = (id) => document.getElementById(id);

const INPUT_IDS = ["date", "totalMmk", "totalQuantity", "fee", "dailyRate"];
const RECENT_LIMIT = 5;


/* =========================================================
   CALCULATOR
========================================================= */

function calculate(options = {}) {
    const { quiet = false } = options;

    const totalMmk = num($("totalMmk").value);
    const totalQuantity = num($("totalQuantity").value);
    const fee = num($("fee").value);
    const dailyRate = num($("dailyRate").value);

    const p2pInput = $("p2pRate");
    const typedRate = p2pInput ? num(p2pInput.value) : 0;

    const derivedRate =
        totalMmk > 0 && totalQuantity > 0
            ? totalMmk / totalQuantity
            : 0;

    const p2pRate = derivedRate > 0 ? derivedRate : typedRate;

    if (p2pInput) {
        if (derivedRate > 0) {
            p2pInput.value = derivedRate.toFixed(2);
        }
    }

    /* the requested formula, unchanged */

    const receiveQuantity = Math.max(totalQuantity - fee, 0);
    const spread = dailyRate - p2pRate;
    const grossProfit = receiveQuantity * spread;
    const feeLoss = fee * spread;
    const netProfit = grossProfit - feeLoss;

    /* derived figures */

    const buyingRate =
        totalMmk > 0 && receiveQuantity > 0
            ? totalMmk / receiveQuantity
            : 0;

    const p2pValue = receiveQuantity * p2pRate;
    const marketValue = receiveQuantity * dailyRate;
    const marginPercent = p2pRate !== 0 ? (spread / p2pRate) * 100 : 0;

    const hasInput =
        totalMmk > 0 || totalQuantity > 0 || fee > 0 || dailyRate > 0;

    /* paint */

    $("receiveQuantity").innerHTML =
        `${num(receiveQuantity).toLocaleString(undefined, {
            minimumFractionDigits: 6,
            maximumFractionDigits: 6
        })} <em>USDT</em>`;

    $("profitPerUsdt").innerHTML = `${spread.toFixed(2)} <em>MMK</em>`;
    $("grossProfit").textContent = money(grossProfit);
    $("feeLoss").textContent = money(feeLoss);
    $("netProfit").innerHTML = `${shortMoney(netProfit)} <em>MMK</em>`;
    $("spreadValue").textContent = money(spread);
    $("p2pValue").textContent = money(p2pValue);
    $("marketValue").textContent = money(marketValue);
    $("marginPercent").textContent = `${marginPercent.toFixed(2)}%`;

    const rateOut = $("p2pRateOut");
    const buyOut = $("buyRateOut");
    const rateTag = $("rateTag");

    if (rateOut) {
        rateOut.textContent = p2pRate > 0
            ? `${p2pRate.toFixed(2)} MMK / USDT`
            : "— MMK / USDT";
    }

    if (buyOut) {
        buyOut.textContent = buyingRate > 0
            ? `${buyingRate.toFixed(2)} MMK / USDT`
            : "— MMK / USDT";
    }

    if (rateTag) {
        rateTag.textContent = derivedRate > 0 ? "auto" : "manual";
        rateTag.classList.toggle("manual", derivedRate <= 0);
    }

    if (p2pInput) {
        p2pInput.readOnly = derivedRate > 0;
        p2pInput.classList.toggle("derived", derivedRate > 0);
    }

    /* hero */

    const hero = $("heroCard");

    if (hero) hero.classList.toggle("is-loss", hasInput && netProfit < 0);

    const note = $("heroNote");

    if (note) {
        if (!hasInput) {
            note.textContent = "Waiting for your numbers.";
        } else if (netProfit > 0) {
            note.textContent = `Profitable day · ${spread.toFixed(2)} MMK per USDT spread`;
        } else if (netProfit < 0) {
            note.textContent = `Losing day · spread is ${spread.toFixed(2)} MMK per USDT`;
        } else {
            note.textContent = "Break-even — no spread on this trade.";
        }
    }

    const pill = $("dayPill");

    if (pill) pill.textContent = formatDateLabel($("date").value);

    if (!quiet && hasInput) showMessage("Calculation updated.", "success");
    return {
        date: $("date").value,
        totalMmk,
        totalQuantity,
        fee,
        receiveQuantity,
        p2pRate,
        buyingRate,
        dailyRate,
        spread,
        grossProfit,
        feeLoss,
        netProfit,
        marginPercent,
        p2pValue,
        marketValue,
        version: APP_VERSION
    };
}


/* =========================================================
   VALIDATION
========================================================= */

function markInvalid(ids, valid) {
    ids.forEach((id) => {
        const field = $(id);
        if (!field) return;

        field.classList.toggle("invalid", !valid);
    });
}

function validate(result) {
    const missing = [];

    if (!result.date) missing.push("date");
    if (result.totalMmk <= 0) missing.push("totalMmk");
    if (result.totalQuantity <= 0) missing.push("totalQuantity");
    if (result.dailyRate <= 0) missing.push("dailyRate");

    markInvalid(INPUT_IDS, true);

    if (missing.length === 0) return null;

    markInvalid(missing, false);

    const first = $(missing[0]);
    if (first) first.focus();

    const labels = {
        date: "date",
        totalMmk: "Total MMK paid",
        totalQuantity: "Total Quantity",
        dailyRate: "Daily Binance P2P Market Rate"
    };

    return `Please enter a valid ${missing.map((key) => labels[key]).join(", ")}.`;
}


/* =========================================================
   SAVE
========================================================= */

function saveDay(options = {}) {
    const { andNew = false } = options;

    const result = calculate({ quiet: true });

    const problem = validate(result);

    if (problem) {
        showMessage(problem, "error");
        return false;
    }

    markInvalid(INPUT_IDS, true);

    const history = getHistory();

    const existingIndex = history.findIndex(
        (item) => item.date === result.date
    );

    let message;

    if (existingIndex >= 0) {
        history[existingIndex] = result;
        message = `${result.date} updated in your history.`;
    } else {
        history.push(result);
        message = `${result.date} saved successfully.`;
    }

    if (!saveHistory(sortHistory(history))) return false;

    renderRecent();

    if (andNew) {
        clearCalculator();
        showMessage(`${message} Ready for the next entry.`, "success");
    } else {
        showMessage(message, "success");
    }

    return true;
}


/* =========================================================
   RECENT STRIP
========================================================= */

function renderRecent() {
    const body = $("recentBody");
    if (!body) return;

    const history = getHistory().slice(0, RECENT_LIMIT);

    body.innerHTML = "";

    if (history.length === 0) {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td colspan="6" class="empty">
                Nothing saved yet — fill the form above and press Save Day.
            </td>
        `;

        body.appendChild(row);

        return;
    }

    const fragment = document.createDocumentFragment();

    history.forEach((item) => {
        const buyingRate = buyingRateOf(item);
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHtml(item.date)}</td>
            <td class="num">${buyingRate > 0 ? buyingRate.toFixed(2) : "—"}</td>
            <td class="num">${usdt(item.receiveQuantity)}</td>
            <td class="num">${num(item.spread).toFixed(2)}</td>
            <td class="num ${item.netProfit >= 0 ? "profit" : "loss"}">
                ${money(item.netProfit)}
            </td>
            <td class="num">
                <div class="row-actions">
                    <button type="button" class="btn ghost small-btn" data-load="${escapeHtml(item.date)}">
                        Load
                    </button>
                </div>
            </td>
        `;

        fragment.appendChild(row);
    });

    body.appendChild(fragment);
}

function loadDay(date) {
    const item = getHistory().find((row) => row.date === date);

    if (!item) return;

    $("date").value = item.date || "";
    $("totalMmk").value =
        num(item.totalMmk) > 0 ? num(item.totalMmk).toFixed(2) : "";
    $("totalQuantity").value = num(item.totalQuantity).toFixed(6);
    $("fee").value = num(item.fee).toFixed(6);
    $("dailyRate").value = num(item.dailyRate).toFixed(2);

    markInvalid(INPUT_IDS, true);

    calculate({ quiet: true });

    showMessage(`${item.date} loaded into the form.`, "success");

    window.scrollTo({ top: 0, behavior: "smooth" });
}


/* =========================================================
   CLEAR
========================================================= */

function clearCalculator() {
    ["totalMmk", "totalQuantity", "fee", "dailyRate"].forEach((id) => {
        $(id).value = "";
    });

    const p2pInput = $("p2pRate");
    if (p2pInput) p2pInput.value = "";

    markInvalid(INPUT_IDS, true);

    setToday();

    calculate({ quiet: true });

    hideMessage();

    $("totalMmk").focus();
}


/* =========================================================
   IMPORTED DAY HANDOFF
========================================================= */

function loadImportedSelection() {
    let raw = null;

    try {
        raw = localStorage.getItem(IMPORT_SELECTION_KEY);
    } catch {
        return;
    }

    if (!raw) return;

    try {
        const data = JSON.parse(raw);

        $("date").value = data.date || "";

        $("totalQuantity").value =
            data.totalUsdt != null ? Number(data.totalUsdt).toFixed(6) : "";

        $("fee").value =
            data.totalFee != null ? Number(data.totalFee).toFixed(6) : "";

        $("totalMmk").value = "";
        $("dailyRate").value = "";

        const p2pInput = $("p2pRate");

        if (p2pInput) {
            p2pInput.value =
                data.avgPrice != null ? Number(data.avgPrice).toFixed(2) : "";
        }

        try {
            localStorage.removeItem(IMPORT_SELECTION_KEY);
        } catch {
            /* ignore */
        }

        calculate({ quiet: true });

        showMessage(
            [
                "Imported",
                data.type || "",
                "day",
                data.date || "",
                "loaded — enter the MMK you paid to buy and the Daily Market Rate."
            ].join(" ").replace(/\s+/g, " "),
            "success"
        );

        $("totalMmk").focus();

    } catch {
        try {
            localStorage.removeItem(IMPORT_SELECTION_KEY);
        } catch {
            /* ignore */
        }
    }
}


/* =========================================================
   EVENTS
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    setToday();
    renderRecent();
    loadImportedSelection();
    calculate({ quiet: true });

    /* live recalculation */

    let liveTimer = null;

    ["totalMmk", "totalQuantity", "fee", "dailyRate"].forEach((id) => {
        $(id).addEventListener("input", () => {
            clearTimeout(liveTimer);
            liveTimer = setTimeout(() => calculate({ quiet: true }), 180);
        });
    });

    $("date").addEventListener("change", () => calculate({ quiet: true }));

    /* a typed rate is honoured only while MMK is empty */

    const p2pInput = $("p2pRate");

    if (p2pInput) {
        p2pInput.addEventListener("input", () => {
            const mmk = num($("totalMmk").value);
            const qty = num($("totalQuantity").value);

            if (mmk > 0 && qty > 0) return;

            calculate({ quiet: true });
        });
    }

    $("saveBtn").addEventListener("click", () => saveDay());
    $("saveNewBtn").addEventListener("click", () => saveDay({ andNew: true }));
    $("clearBtn").addEventListener("click", clearCalculator);

    $("recentBody").addEventListener("click", (event) => {
        const target = event.target.closest("button[data-load]");
        if (!target) return;

        loadDay(target.dataset.load);
    });

    document.querySelectorAll('input[type="number"]').forEach((field) => {
        field.addEventListener("wheel", (event) => event.preventDefault(), {
            passive: false
        });
    });

    document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            saveDay();
        }
    });
});
