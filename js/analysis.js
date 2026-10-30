import { getStore, analyticsData, ANALYSIS_RANGES, ANALYSIS_DIMENSIONS } from './db.js';
import { drawChart, toast, openModal, kvTableHTML, exportCSV } from './utils.js';

const state = { range: 'day', dim: 'channel' };
let data = null;

const UNIT_NAME = { hour: '小时', day: '日', month: '月' };
const fmt = n => Number(n || 0).toLocaleString('zh-CN');
const COLORS = ['#409eff', '#e6a23c', '#67c23a', '#f56c6c', '#722ed1', '#909399'];

// 各维度的主指标（图与表共用口径）
const DIM_META = {
    channel: { field: 'flow', title: '通道过检量对比', unit: '件' },
    team: { field: 'judged', title: '班组判图量对比', unit: '件' },
    judge: { field: 'judged', title: '判图员判图量对比', unit: '件' },
    device: { field: 'onlineRate', title: '设备类别在线率对比', unit: '%' },
    category: { field: 'value', title: '违禁品类查获结构', unit: '件' }
};

// 各维度明细表列定义
const DIM_TABLE = {
    channel: {
        head: ['通道', '过检量', '违禁查获', '待判图', '告警数'],
        row: r => [r.name, fmt(r.flow), r.contraband, r.pending, r.alarms]
    },
    team: {
        head: ['班组', '判图量', '查获违禁', '平均响应(分钟)', '抽检准确率', '综合评分'],
        row: r => [r.name, fmt(r.judged), r.contraband, r.avgDelay, r.accuracy === null ? '样本不足' : `${r.accuracy}%`, r.score]
    },
    judge: {
        head: ['判图员', '班组', '判图量', '查获违禁', '平均响应(分钟)', '抽检准确率', '综合评分'],
        row: r => [r.name, r.team, fmt(r.judged), r.contraband, r.avgDelay, r.accuracy === null ? '样本不足' : `${r.accuracy}%`, r.score]
    },
    device: {
        head: ['设备类别', '设备总数', '在线', '告警', '离线', '在线率', '关联告警'],
        row: r => [r.name, r.total, r.online, r.warning, r.offline, `${r.onlineRate}%`, r.alarms]
    },
    category: {
        head: ['违禁品类', '级别', '查获量', '结构占比'],
        row: (r, i, all) => {
            const total = all.reduce((s, x) => s + x.value, 0) || 1;
            const chip = r.level === 'severe'
                ? '<span class="chip chip-danger">禁止携带</span>'
                : '<span class="chip chip-warn">限制携带</span>';
            return [r.name, chip, r.value, `${(r.value / total * 100).toFixed(1)}%`];
        }
    }
};

function deltaHTML(value, goodWhenDown, unit = '%') {
    const flat = !value;
    const up = value > 0;
    const good = flat ? true : (goodWhenDown ? !up : up);
    const color = flat ? '#909399' : (good ? '#67c23a' : '#f56c6c');
    const arrow = flat ? '—' : (up ? '↑' : '↓');
    return `<span style="color:${color}">${arrow} ${up ? '+' : ''}${value}${unit}</span>
        <span style="color:#909399;margin-left:6px">${data.compareLabel}</span>`;
}

function renderStats() {
    const t = data.totals, d = data.delta;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('anStatFlow', fmt(t.flow));
    set('anStatContraband', fmt(t.contraband));
    set('anStatAlarms', fmt(t.alarms));
    set('anStatEvents', fmt(t.events));
    set('anStatPassengers', fmt(t.passengers));
    set('anStatOnline', `${t.onlineRate}%`);

    const delta = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    delta('anDeltaFlow', deltaHTML(d.flow));
    delta('anDeltaContraband', deltaHTML(d.contraband, true));
    delta('anDeltaAlarms', deltaHTML(d.alarms, true));
    delta('anDeltaEvents', deltaHTML(d.events, true));
    delta('anDeltaPassengers', deltaHTML(d.passengers));
    delta('anDeltaOnline', deltaHTML(d.onlineRate, false, 'pt'));

    const bar = document.getElementById('anCompareBar');
    if (bar) {
        bar.innerHTML = `统计口径：<b>${data.rangeLabel}</b> · ${data.buckets.length} 个${UNIT_NAME[data.granularity]}分桶
            ｜环比基准：<b>${data.compareLabel}</b>
            ｜本期过检 ${fmt(t.flow)} 件 / 查获 ${fmt(t.contraband)} 件 / 告警 ${fmt(t.alarms)} 条
            ｜数据来源：业务中枢实时聚合（今日）＋ 数仓按日沉淀（历史）`;
    }
    const unitEl = document.getElementById('anUnitName');
    if (unitEl) unitEl.textContent = UNIT_NAME[data.granularity];
}

function renderCharts() {
    const labels = data.buckets.map(b => b.label);
    drawChart('anFlowChart', `过检量（${DIM_META.channel.unit}）`, data.buckets.map(b => b.flow), labels, COLORS);
    drawChart('anContrabandChart', '违禁查获（件）', data.buckets.map(b => b.contraband), labels, ['#f56c6c']);
    drawChart('anEventChart', '事件数（条）', data.buckets.map(b => b.events), labels, ['#67c23a']);

    const meta = DIM_META[state.dim] || DIM_META.channel;
    const titleEl = document.getElementById('anDimChartTitle');
    if (titleEl) titleEl.textContent = meta.title;
    drawChart('anDimChart', meta.title, data.dim.map(r => r[meta.field] || 0), data.dim.map(r => r.name), COLORS);
}

function renderInsights() {
    const box = document.getElementById('anInsights');
    if (!box) return;
    const titles = ['峰值时段', '查获结构', '设备健康', '人力响应'];
    box.innerHTML = data.insights.map((text, i) => `
        <div class="principle-card">
            <b>${titles[i] || `洞察 ${i + 1}`}</b>
            <small>${text}</small>
        </div>`).join('');
}

function renderDimTable() {
    const cfg = DIM_TABLE[state.dim] || DIM_TABLE.channel;
    const head = document.getElementById('anDimHead');
    const body = document.getElementById('anDimBody');
    const title = document.getElementById('anDimTitle');
    if (!head || !body) return;

    const dimName = (ANALYSIS_DIMENSIONS.find(d => d.key === state.dim) || {}).name || '通道';
    if (title) title.textContent = dimName;

    head.innerHTML = `<tr>${cfg.head.map(h => `<th>${h}</th>`).join('')}</tr>`;
    body.innerHTML = data.dim.map((r, i) => {
        const cells = cfg.row(r, i, data.dim).map(c => `<td>${c}</td>`);
        const warn = state.dim === 'device' && r.onlineRate < 100 ? ' style="background:rgba(230,162,60,0.08)"' : '';
        return `<tr${warn}>${cells.join('')}</tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:#909399;">暂无维度数据</td></tr>';
}

function deltaCell(v) {
    if (v === null || v === undefined) return '<span style="color:#909399">—</span>';
    const color = v > 0 ? '#67c23a' : (v < 0 ? '#f56c6c' : '#909399');
    return `<span style="color:${color}">${v > 0 ? '+' : ''}${v}%</span>`;
}

function renderBucketTable() {
    const tbody = document.getElementById('anTableBody');
    if (!tbody) return;
    tbody.innerHTML = data.buckets.map(b => `
        <tr>
            <td>${b.label}${b.real ? ' <span class="chip chip-pass">实时</span>' : (b.weekday ? `<span style="font-size:11px;color:#909399"> ${b.weekday}</span>` : '')}</td>
            <td>${fmt(b.flow)}</td>
            <td>${deltaCell(b.flowDelta)}</td>
            <td style="color:#f56c6c;">${b.contraband}</td>
            <td style="color:#e6a23c;">${b.alarms}</td>
            <td>${fmt(b.events)}</td>
            <td>${fmt(b.passengers)}</td>
            <td>${b.onlineRate}%</td>
            <td><button class="btn btn-small btn-primary" data-drill="${b.key}">钻取</button></td>
        </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:#909399;">暂无数据</td></tr>';

    tbody.querySelectorAll('[data-drill]').forEach(btn => {
        btn.onclick = () => showBucketDetail(btn.dataset.drill);
    });
}

// 钻取：小时桶回源真实明细，其他粒度展示聚合构成并可跳转数据中台
function showBucketDetail(key) {
    const bucket = data.buckets.find(b => b.key === key);
    if (!bucket) return;
    const store = getStore();
    const totalFlow = data.totals.flow || 1;
    const rows = [
        ['统计粒度', `${data.rangeLabel} / ${UNIT_NAME[data.granularity]}`],
        ['分桶', bucket.label + (bucket.weekday ? `（${bucket.weekday}）` : '')],
        ['过检量', `${fmt(bucket.flow)} 件（占本期 ${(bucket.flow / totalFlow * 100).toFixed(1)}%）`],
        ['环比上一分桶', bucket.flowDelta === null ? '首个分桶' : `${bucket.flowDelta > 0 ? '+' : ''}${bucket.flowDelta}%`],
        ['违禁查获 / 告警 / 事件', `${bucket.contraband} 件 / ${bucket.alarms} 条 / ${fmt(bucket.events)} 条`],
        ['客流 / 设备在线率', `${fmt(bucket.passengers)} 人次 / ${bucket.onlineRate}%`]
    ];

    if (data.granularity !== 'hour') {
        openModal({
            title: `分桶钻取 - ${bucket.label}`,
            width: 560,
            bodyHTML: kvTableHTML(rows) + `
                <div style="margin-top:12px;font-size:12px;color:#909399;line-height:1.8;">
                    历史分桶为聚合口径（DWS 日汇总），明细报文存于数据中台 ODS 层。如需按包裹/事件逐条追溯，可前往数据中台查看血缘与原始表。
                </div>`,
            actions: [{
                label: '前往数据中台',
                className: 'btn-secondary',
                onClick: (close) => {
                    close();
                    const nav = document.querySelector('.nav-item[data-nav="datacenter"]');
                    if (nav) nav.click();
                }
            }]
        });
        return;
    }

    const h = parseInt(key.slice(0, 2), 10);
    const hourBags = store.bags.filter(b => new Date(b.scanTs).getHours() === h);
    const hourEvents = store.events.filter(e => new Date(e._ts).getHours() === h);
    const hourAlarms = store.alarms.filter(a => new Date(a.ts).getHours() === h);

    const bagRows = hourBags.slice(0, 8).map(b => `
        <tr><td>${b.id}</td><td>${b.channelName}</td><td>${b.ownerName}</td>
        <td>${b.judgeResult || (b.status === 'pending' ? '待判图' : 'AI 放行')}</td><td>${b.disposition || '-'}</td></tr>`).join('');
    const evtRows = hourEvents.slice(0, 8).map(e => `
        <tr><td>${e.time.slice(11)}</td><td>${e.device}</td><td>${e.type}</td><td>${e.processStatus}</td></tr>`).join('');
    const almRows = hourAlarms.slice(0, 8).map(a => `
        <tr><td>${a.time.slice(11)}</td><td>${a.device}</td><td>${a.type}</td><td>${a.status}</td></tr>`).join('');

    openModal({
        title: `分桶钻取 - ${bucket.label}`,
        width: 760,
        bodyHTML: `
            ${kvTableHTML(rows)}
            <div class="sub-title">该时段包裹（${hourBags.length} 件，展示前 8）</div>
            ${bagRows ? `<table class="data-table"><thead><tr><th>包裹</th><th>通道</th><th>旅客</th><th>判图</th><th>处置</th></tr></thead><tbody>${bagRows}</tbody></table>`
            : '<p style="color:#909399;font-size:12px;">该时段无包裹记录。</p>'}
            <div class="sub-title">该时段事件（${hourEvents.length} 条，展示前 8）</div>
            ${evtRows ? `<table class="data-table"><thead><tr><th>时间</th><th>设备</th><th>类型</th><th>状态</th></tr></thead><tbody>${evtRows}</tbody></table>`
            : '<p style="color:#909399;font-size:12px;">该时段无事件记录。</p>'}
            <div class="sub-title">该时段告警（${hourAlarms.length} 条，展示前 8）</div>
            ${almRows ? `<table class="data-table"><thead><tr><th>时间</th><th>设备</th><th>类型</th><th>状态</th></tr></thead><tbody>${almRows}</tbody></table>`
            : '<p style="color:#909399;font-size:12px;">该时段无告警记录。</p>'}`
    });
}

function exportBuckets() {
    exportCSV(`运营分时报表_${state.range}_${new Date().toISOString().slice(0, 10)}.csv`,
        ['时段', '过检量', '环比(%)', '违禁查获', '告警', '事件', '客流', '在线率(%)'],
        data.buckets.map(b => [b.label, b.flow, b.flowDelta === null ? '-' : b.flowDelta, b.contraband, b.alarms, b.events, b.passengers, b.onlineRate]));
}

function exportDim() {
    const cfg = DIM_TABLE[state.dim] || DIM_TABLE.channel;
    const dimName = (ANALYSIS_DIMENSIONS.find(d => d.key === state.dim) || {}).name || '维度';
    exportCSV(`维度分析_${dimName}_${state.range}_${new Date().toISOString().slice(0, 10)}.csv`,
        ['统计口径', ...cfg.head],
        data.dim.map((r, i) => [data.rangeLabel, ...cfg.row(r, i, data.dim).map(c => String(c).replace(/<[^>]+>/g, ''))]));
}

function refresh() {
    data = analyticsData(state.range, state.dim);
    renderStats();
    renderCharts();
    renderInsights();
    renderDimTable();
    renderBucketTable();
}

window.initAnalysisModule = function () {
    const rangeSel = document.getElementById('anRange');
    const dimSel = document.getElementById('anDim');
    if (rangeSel) rangeSel.value = state.range;
    if (dimSel) {
        dimSel.innerHTML = ANALYSIS_DIMENSIONS.map(d => `<option value="${d.key}">${d.name}</option>`).join('');
        dimSel.value = state.dim;
        dimSel.onchange = () => {
            state.dim = dimSel.value;
            refresh();
            const meta = ANALYSIS_DIMENSIONS.find(d => d.key === state.dim);
            toast(`维度已切换为「${meta ? meta.name : state.dim}」：${meta ? meta.desc : ''}`, 'info');
        };
    }
    if (rangeSel) rangeSel.onchange = () => {
        state.range = rangeSel.value;
        refresh();
        toast(`统计口径已切换为「${ANALYSIS_RANGES[state.range].label}」`, 'success');
    };

    const refreshBtn = document.getElementById('anRefreshBtn');
    if (refreshBtn) refreshBtn.onclick = () => {
        const store = getStore();
        delete store.analyticsHistory;
        refresh();
        toast('统计数据已按最新业务重算（含历史口径重采样）', 'success');
    };
    const exportBtn = document.getElementById('anExportBtn');
    if (exportBtn) exportBtn.onclick = exportBuckets;
    const exportDimBtn = document.getElementById('anExportDimBtn');
    if (exportDimBtn) exportDimBtn.onclick = exportDim;

    refresh();
    console.log(`统计分析已加载：${data.buckets.length} 个${UNIT_NAME[data.granularity]}分桶，${data.dim.length} 个维度项`);
};
