import { getStore, perfStats } from './db.js';
import { drawChart, toast, openModal, kvTableHTML, exportCSV } from './utils.js';

let rows = [];
const MEDALS = ['🥇', '🥈', '🥉'];

function renderRankCards() {
    const wrap = document.getElementById('perfRankCards');
    wrap.innerHTML = rows.slice(0, 3).map((r, i) => `
        <div class="rank-card r-${i + 1}">
            <div class="r-medal">${MEDALS[i]}</div>
            <div class="r-name">${r.name}</div>
            <div class="r-sub">${r.team} · 判图 ${r.judged} 件 · 查获 ${r.danger}</div>
            <div class="r-score">${r.score}</div>
            <div class="r-sub">综合评分</div>
        </div>`).join('');
}

function renderCharts() {
    const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#722ed1', '#909399'];
    drawChart('perfJudgeChart', '判图量（件）', rows.map(r => r.judged), rows.map(r => r.name), colors);
    drawChart('perfDangerChart', '查获违禁（件）', rows.map(r => r.danger), rows.map(r => r.name), colors);
}

function renderTable() {
    const tbody = document.getElementById('perfTableBody');
    tbody.innerHTML = '';
    rows.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.className = 'perf-row';
        tr.innerHTML = `
            <td>${i < 3 ? MEDALS[i] + ' ' : ''}${r.name}<div style="font-size:11px;color:#909399">${r.id}</div></td>
            <td>${r.onDuty ? '<span class="chip chip-pass">当班</span>' : '<span class="chip chip-info">休班</span>'}</td>
            <td>${r.judged}</td>
            <td style="color:#f56c6c;">${r.danger}</td>
            <td style="color:#e6a23c;">${r.suspect}</td>
            <td>${r.avgDelay} 分钟</td>
            <td>${r.qc}</td>
            <td>${r.missed > 0 ? `<b style="color:#f56c6c;">${r.missed}</b>` : 0}</td>
            <td>${r.accuracy === null ? '—' : r.accuracy + '%'}</td>
            <td><span class="score-bar"><i style="width:${r.score}%"></i></span>${r.score}</td>`;
        tr.onclick = () => showPersonDetail(r);
        tbody.appendChild(tr);
    });
}

// 个人作业记录（含质控抽检结论）
function showPersonDetail(r) {
    const recent = r.bags.slice().sort((a, b) => (b.judgeTs || 0) - (a.judgeTs || 0)).slice(0, 10);
    const listHTML = recent.length ? `
        <table class="data-table" style="margin-top:8px;">
            <thead><tr><th>包裹</th><th>判图结果</th><th>处置</th><th>响应</th><th>质控抽检</th></tr></thead>
            <tbody>${recent.map(b => {
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
        width: 700,
        bodyHTML: `
            ${kvTableHTML([
                ['岗位/班次', `判图员 · ${r.team}${r.onDuty ? '（当班中）' : '（休班）'}`],
                ['今日判图', `${r.judged} 件`],
                ['查获违禁', `${r.danger} 件 · 可疑转检 ${r.suspect} 件`],
                ['平均响应', `${r.avgDelay} 分钟`],
                ['质控抽检', `抽中 ${r.qc} 件 · 漏判 ${r.missed} · 不规范 ${r.sloppy}`],
                ['抽检准确率', r.accuracy === null ? '样本不足' : `${r.accuracy}%`],
                ['综合评分', `<span class="score-bar"><i style="width:${r.score}%"></i></span><b>${r.score}</b>`]
            ])}
            <div class="sub-title">最近判图记录</div>${listHTML}`
    });
}

function refresh() {
    const store = getStore();
    rows = perfStats(store);
    renderRankCards();
    renderCharts();
    renderTable();
}

window.initPerformanceModule = function() {
    document.getElementById('perfExportBtn').onclick = () => {
        exportCSV(`判图员绩效考核_${new Date().toISOString().slice(0, 10)}.csv`,
            ['判图员', '班组', '班次状态', '判图量', '查获违禁', '可疑转检', '平均响应(分钟)', '抽检数', '漏判', '处置不规范', '抽检准确率(%)', '综合评分'],
            rows.map(r => [r.name, r.team, r.onDuty ? '当班' : '休班', r.judged, r.danger, r.suspect, r.avgDelay,
                r.qc, r.missed, r.sloppy, r.accuracy === null ? '-' : r.accuracy, r.score]));
    };
    refresh();
    toast(`已按质控抽检口径生成 ${rows.length} 名判图员的今日考核`, 'info');
};
