/* =========================================================
   BINANCE P2P MMK  —  history.js
   Daily History page: the full record with search, month
   filter, profit/loss filter, sorting, paging and export.
========================================================= */

"use strict";

const $ = (id) => document.getElementById(id);

const PAGE_SIZE = 25;

let viewRows = [];
let visibleCount = PAGE_SIZE;


/* =========================================================
   FILTER + SORT
========================================================= */

function currentFilters() {
    return {
        search: ($("searchInput").value || "").trim().toLowerCase(),
        month: $("monthInput").value || "",
        result: $("resultInput").value || "",
        sort: $("sortInput").value || "date-desc"
    };
}

function buildMonthOptions(history) {
    const select = $("monthInput");
    if (!select) return;

    const months = Array.from(
        new Set(history.map((item) => String(item.date || "").slice(0, 7)))
    )
        .filter(Boolean)
        .sort()
        .reverse();

    const previous = select.value;

    select.innerHTML = '<option value="">All months</option>';

    months.forEach((month) => {
        const option = document.createElement("option");

        option.value = month;
        option.textContent = monthLabel(`${month}-01`);

        select.appendChild(option);
    });

    if (months.includes(previous)) select.value = previous;
}

function applyFilters(history) {
    const { search, month, result, sort } = currentFilters();

    let rows = history.filter((item) => {
        const date = String(item.date || "");

        if (search) {
            const readable = formatDateLabel(date).toLowerCase();
            const monthName = monthLabel(date).toLowerCase();

            if (
                !date.includes(search) &&
                !readable.includes(search) &&
                !monthName.includes(search)
            ) {
                return false;
            }
        }

        if (month && !date.startsWith(month)) return false;

        if (result === "profit" && num(item.netProfit) < 0) return false;
        if (result === "loss" && num(item.netProfit) >= 0) return false;

        return true;
    });

    rows = rows.slice().sort((a, b) => {
        if (sort === "date-asc") return new Date(a.date) - new Date(b.date);
        if (sort === "profit-desc") return num(b.netProfit) - num(a.netProfit);
        if (sort === "profit-asc") return num(a.netProfit) - num(b.netProfit);

        return new Date(b.date) - new Date(a.date);
    });

    return rows;
}


/* =========================================================
   RENDER
========================================================= */

function render() {
    const history = getHistory();

    buildMonthOptions(history);

    viewRows = applyFilters(history);

    const body = $("historyBody");
    if (!body) return;

    body.innerHTML = "";

    if (viewRows.length === 0) {
        const row = document.createElement("tr");

        row.innerHTML = history.length === 0
            ? `<td colspan="11" class="empty">
                   No saved days yet — add one on the New Entry page.
               </td>`
            : `<td colspan="11" class="empty">
                   No days match these filters.
               </td>`;

        body.appendChild(row);

        updateViewTotals([]);

        $("moreBtn").classList.add("hidden");
        $("tableFootNote").textContent = "";

        updateSubtitle(history.length, 0);

        return;
    }

    const slice = viewRows.slice(0, visibleCount);

    const fragment = document.createDocumentFragment();

    slice.forEach((item) => {
        const buyingRate = buyingRateOf(item);
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHtml(item.date)}</td>
            <td class="num">${buyingRate > 0 ? buyingRate.toFixed(2) : "—"}</td>
            <td class="num">${num(item.totalMmk) > 0 ? shortMoney(item.totalMmk) : "—"}</td>
            <td class="num">${usdt(item.totalQuantity)}</td>
            <td class="num">${usdt(item.fee)}</td>
            <td class="num">${usdt(item.receiveQuantity)}</td>
            <td class="num">${num(item.p2pRate).toFixed(2)}</td>
            <td class="num">${num(item.dailyRate).toLocaleString()}</td>
            <td class="num ${num(item.spread) >= 0 ? "profit" : "loss"}">
                ${num(item.spread).toFixed(2)}
            </td>
            <td class="num ${item.netProfit >= 0 ? "profit" : "loss"}">
                ${money(item.netProfit)}
            </td>
            <td class="num">
                <div class="row-actions">
                    <button type="button" class="btn ghost small-btn" data-load="${escapeHtml(item.date)}">
                        Load
                    </button>
                    <button type="button" class="btn danger-ghost small-btn" data-delete="${escapeHtml(item.date)}">
                        Delete
                    </button>
                </div>
            </td>
        `;

        fragment.appendChild(row);
    });

    body.appendChild(fragment);

    updateViewTotals(viewRows);

    const more = $("moreBtn");
    const note = $("tableFootNote");

    if (viewRows.length > slice.length) {
        more.classList.remove("hidden");
        more.textContent = `Show more (${viewRows.length - slice.length} left)`;
        note.textContent = `Showing ${slice.length} of ${viewRows.length} matching days`;
    } else {
        more.classList.add("hidden");
        note.textContent = `Showing all ${viewRows.length} matching days`;
    }

    updateSubtitle(history.length, viewRows.length);
}

function updateSubtitle(total, shown) {
    const subtitle = $("historySubtitle");
    if (!subtitle) return;

    if (total === 0) {
        subtitle.textContent = "Every saved day, newest first.";
        return;
    }

    subtitle.textContent = shown === total
        ? `${total} saved day(s) in this browser.`
        : `${shown} of ${total} saved day(s) shown.`;
}

function updateViewTotals(rows) {
    const mmk = rows.reduce((sum, item) => sum + num(item.totalMmk), 0);
    const profit = rows.reduce((sum, item) => sum + num(item.netProfit), 0);

    const wins = rows.filter((item) => num(item.netProfit) > 0).length;

    $("viewDays").textContent = rows.length;
    $("viewMmk").textContent = money(mmk);
    $("viewProfit").textContent = money(profit);
    $("viewAverage").textContent = rows.length > 0
        ? money(profit / rows.length)
        : money(0);

    const subtitle = $("historySubtitle");

    if (subtitle && rows.length > 0) {
        subtitle.textContent =
            `${subtitle.textContent} ${wins} profitable, ${rows.length - wins} not.`;
    }
}


/* =========================================================
   ROW ACTIONS
========================================================= */

function loadDay(date) {
    try {
        localStorage.setItem(
            IMPORT_SELECTION_KEY,
            JSON.stringify({ date, prefillFromHistory: date })
        );
    } catch {
        /* ignore — the entry page will simply open empty */
    }

    window.location.href = `input.html?date=${encodeURIComponent(date)}`;
}

function deleteDay(date) {
    const history = getHistory().filter((row) => row.date !== date);

    if (!saveHistory(sortHistory(history))) return;

    render();

    showMessage(`${date} removed from your history.`, "success");
}

function clearHistory() {
    const history = getHistory();

    if (history.length === 0) {
        showMessage("There is no history to clear.", "error");
        return;
    }

    if (!confirm(`Delete all ${history.length} saved days?`)) return;

    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch {
        showMessage("Could not clear storage in this browser.", "error");
        return;
    }

    visibleCount = PAGE_SIZE;

    render();

    showMessage("History cleared.", "success");
}


/* =========================================================
   EXPORT (exports the current view, not everything)
========================================================= */

function exportView() {
    if (viewRows.length === 0) {
        showMessage("There is nothing to export with these filters.", "error");
        return;
    }

    const headers = [
        "Date",
        "Buying Rate MMK",
        "Total MMK Paid",
        "Total Quantity USDT",
        "Fee USDT",
        "Receive Quantity USDT",
        "P2P Rate MMK",
        "Daily Rate MMK",
        "Spread MMK",
        "Gross Profit MMK",
        "Fee Loss MMK",
        "Net Profit MMK"
    ];

    const rows = viewRows.map((item) => [
        item.date,
        buyingRateOf(item) > 0 ? buyingRateOf(item).toFixed(2) : "",
        item.totalMmk,
        item.totalQuantity,
        item.fee,
        item.receiveQuantity,
        item.p2pRate,
        item.dailyRate,
        item.spread,
        item.grossProfit,
        item.feeLoss,
        item.netProfit
    ]);

    downloadCSV(
        `binance_p2p_mmk_history_${todayISO()}.csv`,
        headers,
        rows
    );

    showMessage(`Exported ${viewRows.length} day(s) to CSV.`, "success");
}


/* =========================================================
   EVENTS
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    render();

    let searchTimer = null;

    $("searchInput").addEventListener("input", () => {
        clearTimeout(searchTimer);

        searchTimer = setTimeout(() => {
            visibleCount = PAGE_SIZE;
            render();
        }, 200);
    });

    ["monthInput", "resultInput", "sortInput"].forEach((id) => {
        $(id).addEventListener("change", () => {
            visibleCount = PAGE_SIZE;
            render();
        });
    });

    $("resetFiltersBtn").addEventListener("click", () => {
        $("searchInput").value = "";
        $("monthInput").value = "";
        $("resultInput").value = "";
        $("sortInput").value = "date-desc";

        visibleCount = PAGE_SIZE;
        render();
    });

    $("moreBtn").addEventListener("click", () => {
        visibleCount += PAGE_SIZE;
        render();
    });

    $("exportBtn").addEventListener("click", exportView);
    $("clearHistoryBtn").addEventListener("click", clearHistory);

    $("historyBody").addEventListener("click", (event) => {
        const target = event.target.closest("button");
        if (!target) return;

        if (target.dataset.load) loadDay(target.dataset.load);
        if (target.dataset.delete) deleteDay(target.dataset.delete);
    });
});
