import { getStore, aggregate } from './db.js';
import { drawChart, exportCSV, toast } from './utils.js';

// 当前时间范围
function timeRangeMs() {
    const sel = document.getElementById('timeRangeFilter');
    const v = sel ? sel.value : 'day';
    const now = Date.now();
    const ranges = { day: 86400000, week: 7 * 86400000, month: 30 * 86400000, year: 365 * 86400000 };
    return now - (ranges[v] || 86400000);
}

// 全局初始化函数
window.initAnalysisModule = function() {
    loadAnalysisData();
    setupAnalysisActions();
};

// 加载统计数据（全部来自统一业务中枢的真实聚合）
function loadAnalysisData() {
    const data = getStore();
    updateStats(data);
    renderAnalysisCharts(data);
    renderAnalysisTable(data);
}

// 更新统计卡片
function updateStats(store) {
    const agg = aggregate(store);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('totalPassenger', store.passengers.length);
    set('totalContraband', agg.seized);
    set('deviceOnlineRate', `${(agg.deviceStatus.online / store.devices.length * 100).toFixed(1)}%`);
    set('eventProcessRate', `${agg.eventProcessRate}%`);
}

// 渲染分析图表
function renderAnalysisCharts(store) {
    const agg = aggregate(store);
    const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#722ed1'];
    const hourLabels = agg.hours.map(h => `${h}时`);

    // 客流趋势（每小时过检包裹真实序列）
    drawChart('passengerChart', '客流趋势（件/小时）', agg.flowSeries, hourLabels, colors);

    // 违禁品分类（来自交接台账）
    const cb = agg.contrabandByType;
    drawChart('contrabandChart', '违禁品分类', cb.map(c => c.value), cb.map(c => c.name), cb.map(c => c.color));

    // 设备状态分布
    const ds = agg.deviceStatus;
    drawChart('deviceStatusChart', '设备状态分布', [ds.online, ds.warning, ds.offline], ['在线', '告警', '离线'], ['#2ecc71', '#f39c12', '#e74c3c']);

    // 事件类型统计
    drawChart('eventTypeChart', '事件类型统计',
        agg.eventTypeStats.map(x => x[1]), agg.eventTypeStats.map(x => x[0]), colors);
}

// 渲染分析表格（小时明细，真实聚合）
function renderAnalysisTable(store) {
    const tbody = document.getElementById('analysisTableBody');
    if (!tbody) return;
    const agg = aggregate(store);
    tbody.innerHTML = '';

    agg.hourlyTable.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.time}</td>
            <td>${row.flow}</td>
            <td>${row.contraband}</td>
            <td>${row.alarms}</td>
            <td>${row.onlineDevices}/${store.devices.length}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 设置分析模块操作事件
function setupAnalysisActions() {
    const refreshBtn = document.getElementById('refreshBtn');
    const exportBtn = document.getElementById('exportBtn');
    const timeRangeFilter = document.getElementById('timeRangeFilter');

    if (refreshBtn) refreshBtn.onclick = () => { loadAnalysisData(); toast('统计数据已刷新', 'success'); };
    if (timeRangeFilter) timeRangeFilter.onchange = () => {
        loadAnalysisData();
        toast(`统计口径已切换为「${timeRangeFilter.selectedOptions[0].text}」`, 'info');
    };
    if (exportBtn) exportBtn.onclick = () => {
        const agg = aggregate(getStore());
        exportCSV(`运营报表_${new Date().toISOString().slice(0, 10)}.csv`,
            ['时段', '过检包裹', '违禁品查获', '告警数量', '设备在线'],
            agg.hourlyTable.map(r => [r.time, r.flow, r.contraband, r.alarms, `${r.onlineDevices}`]));
    };
}
