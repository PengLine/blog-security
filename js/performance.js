import { getStore, perfStats, perfSummary, perfBreakdown, perfTrend, perfAlerts } from './db.js';
import { drawChart, toast, openModal, kvTableHTML, exportCSV } from './utils.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const COLORS = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#722ed1', '#909399'];
const state = { team: '', duty: '', sort: 'score' };

const byId = id => document.getElementById(id);
const setText = (id, v) => { const el = byId(id); if (el) el.textContent = v; };

// 按筛选条件排序：列表、图表、排行卡共用同一份数据
function pickRows() {
    let list = perfStats(getStore()).filter(r => !state.team || r.team === state.team);
    if (state.duty === 'on') list = list.filter(r => r.onDuty);
    if (state.duty === 'off') list = list.filter(r => !r.onDuty);
    const cmp = {
        score: (a, b) => b.score - a.score,
        judged: (a, b) => b.judged - a.judged,
        danger: (a, b) => b.danger - a.danger,
        delay: (a, b) => b.avgDelay - a.avgDelay,
        missed: (a, b) => b.missed - a.missed
    }[state.sort] || ((a, b) => b.score - a.score);
    return list.slice().sort(cmp);
}

// 统计卡：口径随筛选变化，避免「筛选了班组但卡片还是全量」
function renderStats(list) {
    const sum = perfSummary(list);
    setText('perfStatOnDuty', sum.onDuty);
    setText('perfStatDutyHint', `共 ${sum.total} 名判图员`);
    setText('perfStatJudged', sum.judged);
    setText('perfStatJudgedHint', sum.total ? `人均 ${(sum.judged / sum.total).toFixed(1)} 件` : '—');
    setText('perfStatDanger', sum.danger);
    setText('perfStatDangerHint', sum.judged ? `查获率 ${(sum.danger / sum.judged * 100).toFixed(1)}%` : '—');
    setText('perfStatDelay', `${sum.avgDelay} 分`);
    setText('perfStatDelayHint', sum.avgDelay > 45 ? '超过 45 分钟阈值' : '在阈值内');
    setText('perfStatAccuracy', sum.accuracy === null ? '—' : `${sum.accuracy}%`);
    setText('perfStatAccuracyHint', sum.missed ? `漏判 ${sum.missed} 起` : '无漏判记录');
    setText('perfStatAlerts', perfAlerts(list).length);
    setText('perfStatAlertsHint', `平均分 ${sum.avgScore}`);
}

// 异常预警：按人员聚合成卡片，点击直达作业档案
function renderAlerts(list) {
    const box = byId('perfAlerts');
    if (!box) return;
    const alerts = perfAlerts(list);
    if (!alerts.length) {
        box.innerHTML = '<div class="principle-card is-ok"><b>当前筛选范围内无异常</b><small>漏判、处置不规范、响应超时与工作量失衡均未触发预警。</small></div>';
        return;
    }
    const groups = {};
    alerts.forEach(a => {
        const g = groups[a.empId] || (groups[a.empId] = { name: a.name, team: a.team, empId: a.empId, level: a.level, items: [] });
        g.items.push(a);
    });
    const weight = { high: 0, mid: 1, low: 2 };
    const order = { high: '高危', mid: '关注', low: '提示' };
    box.innerHTML = Object.values(groups)
        .sort((a, b) => weight[a.level] - weight[b.level])
        .map(g => `
            <div class="principle-card perf-alert is-${g.level}" data-emp="${g.empId}">
                <b>${g.name} · ${g.team} <span class="chip ${g.level === 'high' ? 'chip-danger' : g.level === 'mid' ? 'chip-warn' : 'chip-info'}">${order[g.level]}</span></b>
                <small>${g.items.map(i => `${i.title}：${i.detail}`).join('<br>')}</small>
                <small class="perf-alert-action">处置建议：${g.items[0].action}</small>
            </div>`).join('');
    box.querySelectorAll('[data-emp]').forEach(el => {
        el.onclick = () => {
            const row = perfStats(getStore()).find(r => r.id === el.dataset.emp);
            if (row) showPersonDetail(row);
        };
    });
}

function renderCharts(list) {
    const trend = perfTrend(7);
    drawChart('perfJudgeChart', '判图量（件）', list.map(r => r.judged), list.map(r => r.name), COLORS);
    drawChart('perfDangerChart', '查获违禁（件）', list.map(r => r.danger), list.map(r => r.name), COLORS);
    drawChart('perfTrendChart', '团队平均分', trend.map(t => t.score), trend.map(t => t.label), ['#67c23a']);
}

function renderRank(list) {
    const wrap = byId('perfRankCards');
    if (!wrap) return;
    const top = list.slice().sort((a, b) => b.score - a.score).slice(0, 3);
    wrap.innerHTML = top.map((r, i) => `
        <div class="rank-card r-${i + 1}" data-emp="${r.id}">
            <div class="r-medal">${MEDALS[i]}</div>
            <div class="r-name">${r.name}</div>
            <div class="r-sub">${r.team} · 判图 ${r.judged} 件 · 查获 ${r.danger}</div>
            <div class="r-score">${r.score}</div>
            <div class="r-sub">综合评分</div>
        </div>`).join('') || '<div class="principle-card"><b>当前筛选无人员</b><small>调整班组或班次状态后重试。</small></div>';
    wrap.querySelectorAll('[data-emp]').forEach(el => {
        el.onclick = () => {
            const row = list.find(r => r.id === el.dataset.emp);
            if (row) showPersonDetail(row);
        };
    });
}

function renderTable(list) {
    const tbody = byId('perfTableBody');
    if (!tbody) return;
    const alerts = perfAlerts(list);
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#909399;">当前筛选条件下无数据</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(r => {
        const mine = alerts.filter(a => a.empId === r.id);
        const level = mine.some(a => a.level === 'high') ? 'high' : mine.some(a => a.level === 'mid') ? 'mid' : mine.length ? 'low' : '';
        const alertCell = mine.length
            ? `<span class="chip ${level === 'high' ? 'chip-danger' : level === 'mid' ? 'chip-warn' : 'chip-info'}" title="${mine.map(m => m.title).join('、')}">${mine.length} 项</span>`
            : '<span style="color:#67c23a;">正常</span>';
        const acc = r.accuracy === null
            ? '<span style="color:#909399;">样本不足</span>'
            : `<span style="color:${r.accuracy >= 95 ? '#67c23a' : r.accuracy >= 90 ? '#e6a23c' : '#f56c6c'}">${r.accuracy}%</span>`;
        return `<tr class="perf-row" data-emp="${r.id}">
            <td>${r.name}<div style="font-size:11px;color:#909399">${r.id}</div></td>
            <td>${r.team} ${r.onDuty ? '<span class="chip chip-pass">当班</span>' : '<span class="chip chip-info">休班</span>'}</td>
            <td>${r.judged}</td>
            <td style="color:#f56c6c;">${r.danger}</td>
            <td style="color:#e6a23c;">${r.suspect}</td>
            <td style="color:${r.avgDelay > 45 ? '#f56c6c' : 'inherit'}">${r.avgDelay} 分</td>
            <td>${r.qc}</td>
            <td>${r.missed > 0 ? `<b style="color:#f56c6c;">${r.missed}</b>` : 0}</td>
            <td>${acc}</td>
            <td><span class="score-bar"><i style="width:${r.score}%"></i></span>${r.score}</td>
            <td>${alertCell}</td>
        </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-emp]').forEach(tr => {
        tr.onclick = () => {
            const row = list.find(r => r.id === tr.dataset.emp);
            if (row) showPersonDetail(row);
        };
    });
}

// 作业档案：评分构成逐项拆解 + 与团队均值对比 + 近 10 次判图与质控结论
function showPersonDetail(r) {
    const store = getStore();
    const all = perfStats(store);
    const sum = perfSummary(all);
    const bd = perfBreakdown(r);
    const mine = r.bags.slice().sort((a, b) => (b.judgeTs || 0) - (a.judgeTs || 0)).slice(0, 10);
    const alerts = perfAlerts(all).filter(a => a.empId === r.id);

    const cmpLine = (label, val, avg, unit = '', lowerBetter = false) => {
        const diff = +(val - avg).toFixed(1);
        const good = diff === 0 ? null : (lowerBetter ? diff < 0 : diff > 0);
        const color = good === null ? '#909399' : good ? '#67c23a' : '#f56c6c';
        return `<span class="perf-cmp"><b>${label}</b> ${val}${unit}
            <i style="color:${color}">${diff > 0 ? '+' : ''}${diff}${unit}</i>
            <small>团队均值 ${avg}${unit}</small></span>`;
    };

    const bdRows = bd.items.map(it => {
        const negative = it.value < 0;
        const shown = it.kind === 'base' ? `${it.value}` : `${it.value > 0 ? '+' : ''}${it.value}`;
        return `<div class="perf-bd-row">
            <span class="perf-bd-k">${it.label}</span>
            <span class="perf-bd-v" style="color:${it.kind === 'base' ? '#e6f2ff' : negative ? '#f56c6c' : '#67c23a'}">${shown}</span>
            <span class="perf-bd-note">${it.note}</span>
        </div>`;
    }).join('');

    const recHTML = mine.length ? `
        <table class="data-table" style="margin-top:8px;">
            <thead><tr><th>包裹</th><th>判图结果</th><th>处置</th><th>响应</th><th>质控抽检</th></tr></thead>
            <tbody>${mine.map(b => {
                const qc = b.qc
                    ? `<span class="chip ${b.qc.result === '合格' ? 'chip-pass' : b.qc.result === '漏判' ? 'chip-danger' : 'chip-warn'}">${b.qc.result}</span>`
                    : '<span style="color:#909399;">未抽中</span>';
                return `<tr>
                    <td>${b.id}<div style="font-size:11px;color:#909399">${b.ownerName} · ${b.scanTime}</div></td>
                    <td>${b.judgeResult}</td>
                    <td>${b.disposition}</td>
                    <td>${b.reviewDelayMin || '-'} 分钟</td>
                    <td>${qc}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>` : '<p style="color:#909399;font-size:12px;">今日暂无判图记录。</p>';

    openModal({
        title: `作业档案 - ${r.name}（${r.team}）`,
        width: 760,
        bodyHTML: `
            ${kvTableHTML([
                ['岗位 / 班次', `判图员 · ${r.team}${r.onDuty ? '（当班中）' : '（休班）'}`],
                ['今日判图', `${r.judged} 件（查获 ${r.danger} 件 / 可疑转检 ${r.suspect} 件）`],
                ['质控抽检', `抽中 ${r.qc} 件 · 漏判 ${r.missed} · 不规范 ${r.sloppy} · 准确率 ${r.accuracy === null ? '样本不足' : r.accuracy + '%'}`],
                ['综合评分', `<span class="score-bar"><i style="width:${r.score}%"></i></span><b>${r.score}</b>（团队平均 ${sum.avgScore}）`]
            ])}
            <div class="sub-title">评分构成拆解</div>
            <div class="perf-bd">${bdRows}</div>
            <p style="font-size:12px;color:#909399;margin-top:6px;">
                合计 ${bd.raw} 分${bd.floorHit ? '，触发下限截断为 60 分' : bd.ceilHit ? '，触发上限截断为 100 分' : ''}，最终综合评分 <b style="color:#409eff;">${bd.clamped}</b>。
            </p>
            <div class="sub-title">与团队均值对比</div>
            <div class="perf-cmp-row">
                ${cmpLine('综合评分', r.score, sum.avgScore)}
                ${cmpLine('判图量', r.judged, +(sum.judged / (sum.total || 1)).toFixed(1), ' 件')}
                ${cmpLine('平均响应', r.avgDelay, sum.avgDelay, ' 分', true)}
            </div>
            ${alerts.length ? `<div class="sub-title">异常项（${alerts.length}）</div>
            <div class="cfg-issues">${alerts.map(a => `<div class="cfg-issue-line ${a.level === 'high' ? 'is-error' : 'is-warn'}">${a.title}：${a.detail}；${a.action}</div>`).join('')}</div>` : ''}
            <div class="sub-title">最近判图记录</div>${recHTML}`,
        actions: [{ label: '关闭', className: 'btn-secondary', onClick: close => close() }]
    });
}

function renderAll() {
    const list = pickRows();
    renderStats(list);
    renderAlerts(list);
    renderCharts(list);
    renderRank(list);
    renderTable(list);
}

window.initPerformanceModule = function () {
    const store = getStore();

    ['perfTeamFilter', 'perfDutyFilter', 'perfSortSelect'].forEach(id => {
        const el = byId(id);
        if (!el) return;
        el.onchange = () => {
            if (id === 'perfTeamFilter') state.team = el.value;
            if (id === 'perfDutyFilter') state.duty = el.value;
            if (id === 'perfSortSelect') state.sort = el.value;
            renderAll();
        };
    });

    byId('perfExportBtn').onclick = () => {
        const list = pickRows();
        if (!list.length) { toast('当前筛选无数据可导出', 'info'); return; }
        exportCSV(`判图员绩效考核_${new Date().toISOString().slice(0, 10)}.csv`,
            ['判图员', '班组', '班次状态', '判图量', '查获违禁', '可疑转检', '平均响应(分钟)', '抽检数', '漏判', '处置不规范', '抽检准确率(%)', '综合评分', '异常项'],
            list.map(r => [r.name, r.team, r.onDuty ? '当班' : '休班', r.judged, r.danger, r.suspect, r.avgDelay,
                r.qc, r.missed, r.sloppy, r.accuracy === null ? '-' : r.accuracy, r.score,
                perfAlerts(list).filter(a => a.empId === r.id).map(a => a.title).join('/') || '无']));
        toast(`已导出 ${list.length} 名判图员考核明细`, 'success');
    };

    renderAll();
    const sum = perfSummary(perfStats(store));
    toast(`已按质控抽检口径生成 ${sum.total} 名判图员考核，异常 ${sum.alerts} 项`, 'info');
};
