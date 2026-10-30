import { getStore, aggregate, dashboardBoard, processEventById } from './db.js';
import { drawChart, toast, openModal, kvTableHTML, timeAgo, refreshNavBadges } from './utils.js';

let refreshTimer = null;
let currentView = 'captain';

const byId = id => document.getElementById(id);
const goto = nav => {
    const el = document.querySelector(`.nav-item[data-nav="${nav}"]`);
    if (el) el.click();
};

// 业务链路流程条：每步数字取自业务中枢实时聚合
function renderFlowBar() {
    const store = getStore();
    const agg = aggregate(store);
    const steps = [
        { label: '旅客人证核验', count: store.passengers.length, nav: 'face' },
        { label: '人包绑定', count: store.bags.filter(b => b.bindingStatus === '已绑定').length, nav: 'passage' },
        { label: 'X光过检', count: agg.scanned, nav: 'device' },
        { label: '待人工判图', count: agg.pendingJudge, nav: 'judge', hot: true },
        { label: '复检开包', count: store.bags.filter(b => b.recheck && b.recheck.status !== '已完成').length, nav: 'recheck', hot: true },
        { label: '违禁品查扣', count: agg.seized, nav: 'handoff' },
        { label: '民警交接完成', count: store.handoffs.filter(h => h.status === '已完成').length, nav: 'handoff' }
    ];
    const bar = byId('bizFlowBar');
    if (!bar) return;
    bar.innerHTML = '<span style="font-size:12px;color:#909399;margin-right:6px;">业务链路：</span>' + steps.map((s, i) => `
        <span class="flow-step ${s.hot && s.count > 0 ? 'current' : 'done'}" data-nav="${s.nav}">
            ${s.label}<b style="margin-left:4px">${s.count}</b>
        </span>${i < steps.length - 1 ? '<span class="flow-arrow">→</span>' : ''}
    `).join('');
    bar.querySelectorAll('.flow-step').forEach(el => { el.onclick = () => goto(el.dataset.nav); });
}

// 值班视角切换：同一份数据按岗位关注点重排
function renderViews(data) {
    const box = byId('dashViews');
    if (!box) return;
    box.innerHTML = data.views.map(v => `
        <div class="dash-view ${v.key === data.view.key ? 'active' : ''}" data-view="${v.key}">
            <b>${v.name}</b><small>${v.desc}</small>
        </div>`).join('');
    box.querySelectorAll('[data-view]').forEach(el => {
        el.onclick = () => {
            currentView = el.dataset.view;
            renderBoard();
        };
    });
}

// 异常聚合：高危优先，点击卡片跳到对应处置页
function renderAlerts(data) {
    const box = byId('dashAlerts');
    if (!box) return;
    if (!data.alerts.length) {
        box.innerHTML = `<div class="principle-card is-ok"><b>${data.view.name}视角暂无异常</b>
            <small>告警、判图、设备、交接与配置下发均处于阈值内。</small></div>`;
        return;
    }
    const levelName = { high: '高危', mid: '关注', low: '提示' };
    box.innerHTML = data.alerts.map(a => `
        <div class="principle-card dash-alert is-${a.level}" data-nav="${a.nav}">
            <b>${a.title}
                <span class="chip ${a.level === 'high' ? 'chip-danger' : a.level === 'mid' ? 'chip-warn' : 'chip-info'}">${levelName[a.level]}</span>
            </b>
            <small>${a.detail}</small>
            <small class="dash-alert-go">前往处置 →</small>
        </div>`).join('');
    box.querySelectorAll('[data-nav]').forEach(el => { el.onclick = () => goto(el.dataset.nav); });
}

// 统计卡：数字、阈值提示、跳转目标全部由数据层给出
function renderStats(data) {
    const grid = byId('statsGrid');
    if (!grid) return;
    grid.innerHTML = data.cards.map(c => `
        <div class="stat-card clickable dash-card tone-${c.tone || 'info'}" data-nav="${c.nav}">
            <div class="stat-title">${c.title}</div>
            <div class="stat-value">${c.value}</div>
            <div class="stat-trend">${c.hint}</div>
            <div class="dash-card-go">${c.navLabel} →</div>
        </div>`).join('');
    grid.querySelectorAll('[data-nav]').forEach(el => { el.onclick = () => goto(el.dataset.nav); });
}

// 同期对比：今日实时 / 昨日同时段 / 上周同日 + 环比
function renderTrend(data) {
    const tbody = byId('dashTrendBody');
    const label = byId('dashTrendLabel');
    if (label) label.textContent = `同期对比（${data.trend.label}）`;
    if (!tbody) return;
    tbody.innerHTML = data.trend.rows.map(r => {
        const flat = r.delta === 0;
        const good = flat ? null : r.delta > 0;
        const color = flat ? '#909399' : good ? '#67c23a' : '#f56c6c';
        const arrow = flat ? '—' : good ? '↑' : '↓';
        return `<tr>
            <td>${r.label}</td>
            <td><b>${r.today}</b> ${r.unit}</td>
            <td>${r.yesterday} ${r.unit}</td>
            <td>${r.lastweek} ${r.unit}</td>
            <td style="color:${color}">${arrow} ${r.delta > 0 ? '+' : ''}${r.delta}%</td>
        </tr>`;
    }).join('');
}

function renderQuick(data) {
    const box = byId('dashQuick');
    if (!box) return;
    box.innerHTML = data.quick.map(q => `<span class="dash-quick-item" data-nav="${q.nav}">${q.label}</span>`).join('');
    box.querySelectorAll('[data-nav]').forEach(el => { el.onclick = () => goto(el.dataset.nav); });
}

// 图表：小时序列来自真实数据（保留全局入口供窗口 resize 时重绘）
window.renderCharts = function () {
    const store = getStore();
    const agg = aggregate(store);
    const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#722ed1'];
    drawChart('passengerFlowChart', '每小时过检包裹 / 违禁品查获',
        agg.flowSeries.map((v, i) => v + agg.seizeSeries[i] * 40),
        agg.hours.map(h => `${h}时`), colors);
    const cb = agg.contrabandByType;
    drawChart('contrabandChart', '违禁品查获分类',
        cb.map(c => c.value), cb.map(c => c.name), cb.map(c => c.color));
};

function renderEvents(events) {
    const eventsTable = byId('eventsTable');
    if (!eventsTable) return;
    const tbody = eventsTable.querySelector('tbody');
    tbody.innerHTML = '';
    events.slice(0, 12).forEach(event => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${event.time}<div style="font-size:11px;color:#909399">${timeAgo(event._ts)}</div></td>
            <td>${event.device}</td>
            <td>${event.type}</td>
            <td><span class="status-tag ${event.status}">${event.statusName || event.processStatus}</span></td>
            <td>${event.details}</td>
            <td>
                <button class="btn btn-small btn-primary" data-view="${event.id}">查看</button>
                ${event.processStatus !== '已处理' ? `<button class="btn btn-small btn-secondary" data-handle="${event.id}">处理</button>` : ''}
            </td>`;
        tbody.appendChild(row);
    });
    tbody.querySelectorAll('[data-view]').forEach(btn => {
        btn.onclick = () => {
            const evt = getStore().events.find(e => e.id === btn.dataset.view);
            if (evt) showEventDetail(evt);
        };
    });
    tbody.querySelectorAll('[data-handle]').forEach(btn => {
        btn.onclick = () => {
            const store = getStore();
            // 统一走事件引擎的处理入口，保证处理人、备注与审计留痕一致
            const evt = processEventById(btn.dataset.handle, store.currentUser.name, '首页快速处理');
            if (evt) {
                toast(`事件 ${evt.id} 已处理（已留痕）`, 'success');
                renderBoard();
            } else {
                toast('该事件已处理或不存在', 'info');
            }
        };
    });
}

function showEventDetail(evt) {
    const store = getStore();
    const bagIdMatch = (evt.details || '').match(/PKG-\d{8}-\d+/);
    const bag = bagIdMatch ? store.bags.find(b => b.id === bagIdMatch[0]) : null;
    const alarm = store.alarms.find(a => a.id === evt.id || (a.refId && bag && a.refId === bag.id));
    openModal({
        title: `事件详情 - ${evt.id}`,
        bodyHTML: kvTableHTML([
            ['事件时间', evt.time],
            ['触发设备', evt.device],
            ['事件类型', evt.type],
            ['处理状态', evt.handleTime ? `${evt.processStatus}（${evt.handleTime}）` : evt.processStatus],
            ['处理人', evt.handler || '-'],
            ['事件详情', evt.details],
            ['关联旅客', evt.passengerId || '-'],
            alarm ? ['关联告警', `${alarm.id} · ${alarm.level === 'danger' ? '危险' : alarm.level === 'warning' ? '警告' : '提示'} · ${alarm.status}`] : null,
            bag ? ['关联包裹', `${bag.id}（${bag.weightKg}kg，${bag.channelName}）`] : null,
            bag ? ['判图处置', `${bag.judgeResult || '-'} / ${bag.disposition || '-'}${bag.judgeOperator ? `（判图员：${bag.judgeOperator}）` : ''}`] : null
        ])
    });
}

// 看板整体渲染：链路条 → 视角 → 异常 → 卡片 → 对比 → 图表 → 事件
function renderBoard() {
    const data = dashboardBoard(currentView);
    renderFlowBar();
    renderViews(data);
    renderAlerts(data);
    renderStats(data);
    renderTrend(data);
    renderQuick(data);
    renderEvents(getStore().events);
    window.renderCharts();
    refreshNavBadges();
}

window.initDashboardModule = function () {
    renderBoard();
    if (refreshTimer) clearInterval(refreshTimer);
    // 每 30 秒刷新一次（期间判图队列也可能有模拟新包裹到达）
    refreshTimer = setInterval(() => {
        if (byId('statsGrid')) {
            renderBoard();
        } else {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }, 30000);
};
