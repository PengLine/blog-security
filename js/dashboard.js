import { getStore, aggregate } from './db.js';
import { drawChart, toast, openModal, kvTableHTML, timeAgo, refreshNavBadges } from './utils.js';

let refreshTimer = null;

// 渲染业务链路流程条
function renderFlowBar() {
    const store = getStore();
    const agg = aggregate(store);
    const steps = [
        { label: '旅客人证核验', count: store.passengers.length, nav: 'face' },
        { label: '人包绑定', count: store.bags.filter(b => b.bindingStatus === '已绑定').length, nav: 'passage' },
        { label: 'X光过检', count: agg.scanned, nav: 'device' },
        { label: '待人工判图', count: agg.pendingJudge, nav: 'judge', hot: true },
        { label: '违禁品查扣', count: agg.seized, nav: 'handoff' },
        { label: '民警交接完成', count: store.handoffs.filter(h => h.status === '已完成').length, nav: 'handoff' }
    ];
    const bar = document.getElementById('bizFlowBar');
    if (!bar) return;
    bar.innerHTML = '<span style="font-size:12px;color:#909399;margin-right:6px;">业务链路：</span>' + steps.map((s, i) => `
        <span class="flow-step ${s.hot && s.count > 0 ? 'current' : 'done'}" data-nav="${s.nav}">
            ${s.label}<b style="margin-left:4px">${s.count}</b>
        </span>${i < steps.length - 1 ? '<span class="flow-arrow">→</span>' : ''}
    `).join('');
    bar.querySelectorAll('.flow-step').forEach(el => {
        el.onclick = () => {
            const nav = document.querySelector(`.nav-item[data-nav="${el.dataset.nav}"]`);
            if (nav) nav.click();
        };
    });
}

// 渲染统计卡片（真实聚合值）
function renderStats(agg) {
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid) return;

    statsGrid.innerHTML = '';
    agg.cards.forEach(stat => {
        const card = document.createElement('div');
        card.className = 'stat-card clickable';
        const trendIcon = stat.trend === 'up' ? '↑' : '↓';
        const trendClass = stat.trend === 'up' ? 'trend-up' : 'trend-down';
        card.innerHTML = `
            <div class="stat-title">${stat.title}</div>
            <div class="stat-value">${stat.value}</div>
            <div class="stat-trend ${trendClass}">
                ${stat.change ? `${trendIcon} ${stat.change}%` : '<span style="color:#909399">实时</span>'}
            </div>
        `;
        card.onclick = () => {
            if (stat.title === '待判图') document.querySelector('.nav-item[data-nav="judge"]').click();
            else if (stat.title === '未处理告警') document.querySelector('.nav-item[data-nav="alarm"]').click();
            else if (stat.title === '违禁品查获') document.querySelector('.nav-item[data-nav="handoff"]').click();
            else if (stat.title === '设备在线率') document.querySelector('.nav-item[data-nav="device"]').click();
            else if (stat.title === '今日客流') document.querySelector('.nav-item[data-nav="face"]').click();
            else document.querySelector('.nav-item[data-nav="analysis"]').click();
        };
        statsGrid.appendChild(card);
    });
}

// 渲染首页图表（小时序列来自真实数据）
window.renderCharts = function() {
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

// 渲染最新事件列表
function renderEvents(events) {
    const eventsTable = document.getElementById('eventsTable');
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
                <button class="btn btn-primary" data-view="${event.id}">查看</button>
                ${event.processStatus !== '已处理' ? `<button class="btn btn-secondary" data-handle="${event.id}">处理</button>` : ''}
            </td>
        `;
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
            const evt = store.events.find(e => e.id === btn.dataset.handle);
            if (evt) {
                evt.processStatus = '已处理';
                evt.handleTime = new Date().toLocaleString();
                toast(`事件 ${evt.id} 已标记处理`, 'success');
                loadDashboardData();
            }
        };
    });
}

function showEventDetail(evt) {
    const store = getStore();
    const bagIdMatch = evt.details.match(/PKG-\d{8}-\d+/);
    const bag = bagIdMatch ? store.bags.find(b => b.id === bagIdMatch[0]) : null;
    openModal({
        title: `事件详情 - ${evt.id}`,
        bodyHTML: kvTableHTML([
            ['事件时间', evt.time],
            ['触发设备', evt.device],
            ['事件类型', evt.type],
            ['处理状态', evt.processStatus],
            ['事件详情', evt.details],
            ['关联旅客', evt.passengerId || '-'],
            bag ? ['关联包裹'
                , `${bag.id}（${bag.weightKg}kg，${bag.channelName}）`] : null,
            bag ? ['判图处置', `${bag.judgeResult || '-'} / ${bag.disposition || '-'}${bag.judgeOperator ? `（判图员：${bag.judgeOperator}）` : ''}`] : null
        ])
    });
}

// 加载首页数据
function loadDashboardData() {
    const store = getStore();
    const agg = aggregate(store);
    renderFlowBar();
    renderStats(agg);
    renderEvents(store.events);
    window.renderCharts();
    refreshNavBadges();
}

// 全局初始化函数
window.initDashboardModule = function() {
    loadDashboardData();
    if (refreshTimer) clearInterval(refreshTimer);
    // 每 30 秒刷新一次（期间判图队列也可能有模拟新包裹到达）
    refreshTimer = setInterval(() => {
        if (document.getElementById('statsGrid')) {
            loadDashboardData();
        } else {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }, 30000);
};
