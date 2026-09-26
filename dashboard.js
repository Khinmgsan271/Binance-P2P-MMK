/* =========================================================
   BINANCE P2P MMK  —  dashboard.js
   Overview page: totals, the profit graph, quick links and
   a snapshot of the last saved day. All figures come from
   the days saved by the New Entry / Import pages.
========================================================= */

"use strict";

const $ = (id) => document.getElementById(id);

let chartRange = 30;
let chart = null;
let chartReady = false;


/* =========================================================
   TOTALS
========================================================= */

function renderTotals() {
    const history = getHistory();

    const totalMmkPaid = history.reduce(
        (sum, item) => sum + num(item.totalMmk),
        0
    );

    const totalUsdt = history.reduce(
        (sum, item) => sum + num(item.receiveQuantity),
        0
    );

    const totalNetProfit = history.reduce(
        (sum, item) => sum + num(item.netProfit),
        0
    );

    const averageDailyRate = history.length > 0
        ? history.reduce((sum, item) => sum + num(item.dailyRate), 0) /
          history.length
        : 0;

    $("totalDays").textContent = history.length;
    $("totalMmkPaid").textContent = money(totalMmkPaid);
    $("totalUsdt").textContent = usdt(totalUsdt);
    $("totalNetProfit").textContent = money(totalNetProfit);
    $("averageDailyRate").textContent = money(averageDailyRate);

    const card = $("totalNetProfit").closest(".stat-card");

    if (card) {
        card.classList.toggle("is-loss", history.length > 0 && totalNetProfit < 0);
    }

    return history;
}


/* =========================================================
   CHART DATA
========================================================= */

function chartSeries() {
    const history = getHistory()
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const limited = chartRange > 0 ? history.slice(-chartRange) : history;

    /* one bar per calendar day; a day with several rows totals up */

    const byDate = new Map();

    limited.forEach((item) => {
        if (!item.date) return;

        const current = byDate.get(item.date) || {
            date: item.date,
            netProfit: 0
        };

        current.netProfit += num(item.netProfit);

        byDate.set(item.date, current);
    });

    return Array.from(byDate.values());
}


/* =========================================================
   CHART
========================================================= */

function buildOption(labels, profits) {
    const styles = getComputedStyle(document.documentElement);

    const text = styles.getPropertyValue("--text-soft").trim() || "#5a657a";
    const line = styles.getPropertyValue("--border").trim() || "#e0e6f0";
    const good = styles.getPropertyValue("--good").trim() || "#12a150";
    const bad = styles.getPropertyValue("--bad").trim() || "#dc3545";
    const brand = styles.getPropertyValue("--brand").trim() || "#2f6bff";

    return {
        animationDuration: 300,
        grid: { left: 62, right: 18, top: 28, bottom: 36 },
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            valueFormatter: (value) => `${shortMoney(value)} MMK`
        },
        xAxis: {
            type: "category",
            data: labels,
            axisLine: { lineStyle: { color: line } },
            axisTick: { show: false },
            axisLabel: { color: text, fontSize: 11 }
        },
        yAxis: {
            type: "value",
            name: "Net profit (MMK)",
            nameTextStyle: { color: text, fontSize: 11 },
            axisLine: { show: false },
            axisLabel: {
                color: text,
                fontSize: 11,
                formatter: (value) => compactMoney(value)
            },
            splitLine: { lineStyle: { color: line, type: "dashed" } }
        },
        series: [
            {
                type: "bar",
                data: profits.map((value) => ({
                    value,
                    itemStyle: {
                        color: value < 0 ? bad : brand,
                        borderRadius: value < 0 ? [0, 0, 5, 5] : [5, 5, 0, 0]
                    }
                })),
                barMaxWidth: 42,
                emphasis: { itemStyle: { color: good } }
            }
        ]
    };
}

function drawDomChart(labels, profits, wrap) {
    wrap.querySelectorAll(".dom-chart").forEach((node) => node.remove());

    const max = Math.max(...profits.map((v) => Math.abs(v)), 1);

    const holder = document.createElement("div");
    holder.className = "dom-chart";

    profits.forEach((value, index) => {
        const col = document.createElement("div");
        col.className = "dom-col";

        const height = Math.max((Math.abs(value) / max) * 100, 2);

        col.innerHTML = `
            <span class="dom-value">${compactMoney(value)}</span>
            <div class="dom-bar ${value < 0 ? "neg" : "pos"}" style="height:${height}%"></div>
            <span class="dom-label">${escapeHtml(labels[index] || "")}</span>
        `;

        holder.appendChild(col);
    });

    wrap.appendChild(holder);
}

function drawChart() {
    const wrap = $("chartWrap");
    if (!wrap) return;

    const data = chartSeries();

    const empty = $("chartEmpty");
    const subtitle = $("chartSubtitle");

    if (data.length === 0) {
        if (chart) chart.clear();
        if (empty) empty.classList.remove("hidden");

        if (subtitle) {
            subtitle.textContent =
                "Save a few days and your net profit will appear here.";
        }

        return;
    }

    if (empty) empty.classList.add("hidden");

    const labels = data.map((item) => shortDayLabel(item.date));
    const profits = data.map((item) => Number(item.netProfit.toFixed(2)));

    if (subtitle) {
        const total = profits.reduce((a, b) => a + b, 0);

        subtitle.textContent =
            `${data.length} day(s) shown · ${shortMoney(total)} MMK net in this range.`;
    }

    if (chartReady && chart) {
        chart.setOption(buildOption(labels, profits), true);
        return;
    }

    drawDomChart(labels, profits, wrap);
}

function initChart() {
    const wrap = $("chartWrap");
    if (!wrap) return;

    if (window.echarts) {
        chart = window.echarts.init(wrap, null, { renderer: "canvas" });
        chartReady = true;

        window.addEventListener("resize", () => {
            if (chart) chart.resize();
        });

        return;
    }

    /* fallback: the plain-DOM bars draw instead */

    chartReady = false;
}

function initChartRange() {
    const group = document.querySelector(".seg");
    if (!group) return;

    try {
        const saved = Number(localStorage.getItem(CHART_KEY));

        if (Number.isFinite(saved) && saved >= 0) chartRange = saved;
    } catch {
        /* ignore */
    }

    group.querySelectorAll(".seg-btn").forEach((btn) => {
        const range = Number(btn.dataset.range);

        btn.classList.toggle("active", range === chartRange);

        btn.addEventListener("click", () => {
            chartRange = range;

            group.querySelectorAll(".seg-btn").forEach((other) => {
                other.classList.toggle("active", other === btn);
            });

            try {
                localStorage.setItem(CHART_KEY, String(range));
            } catch {
                /* ignore */
            }

            drawChart();
        });
    });
}


/* =========================================================
   LAST DAY
========================================================= */

function renderLastDay(history) {
    const item = history[0];

    const note = $("lastDayNote");

    if (!item) {
        if (note) note.textContent = "Nothing saved yet.";

        ["lastDate", "lastReceive", "lastBuyingRate", "lastSpread", "lastProfit"]
            .forEach((id) => { $(id).textContent = "—"; });

        return;
    }

    const buyingRate = buyingRateOf(item);

    if (note) {
        note.textContent = `Saved entry for ${formatDateLabel(item.date)}.`;
    }

    $("lastDate").textContent = item.date || "—";
    $("lastReceive").textContent = usdt(item.receiveQuantity);
    $("lastBuyingRate").textContent =
        buyingRate > 0 ? `${buyingRate.toFixed(2)} MMK / USDT` : "—";
    $("lastSpread").textContent = money(item.spread);

    const profit = $("lastProfit");

    profit.textContent = money(item.netProfit);
    profit.className = num(item.netProfit) >= 0 ? "value-good" : "value-bad";
}


/* =========================================================
   EVENTS
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    const history = renderTotals();

    initChart();
    initChartRange();
    drawChart();
    renderLastDay(history);
});
