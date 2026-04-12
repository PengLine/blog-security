import { generateMockData, drawChart } from './utils.js';

// 渲染统计卡片
function renderStats(stats) {
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid) return;
    
    statsGrid.innerHTML = '';

    stats.forEach(stat => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        
        const trendIcon = stat.trend === 'up' ? '↑' : '↓';
        const trendClass = stat.trend === 'up' ? 'trend-up' : 'trend-down';
        
        card.innerHTML = `
            <div class="stat-title">${stat.title}</div>
            <div class="stat-value">${stat.value}</div>
            <div class="stat-trend ${trendClass}">
                ${trendIcon} ${stat.change}%
            </div>
        `;
        
        statsGrid.appendChild(card);
    });
}

// 渲染事件列表
function renderEvents(events, tableId = 'eventsTable') {
    const eventsTable = document.getElementById(tableId);
    if (!eventsTable) return;
    
    const tbody = eventsTable.querySelector('tbody');
    tbody.innerHTML = '';

    events.forEach(event => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${event.time}</td>
            <td>${event.device}</td>
            <td>${event.type}</td>
            <td><span class="status-tag ${event.status.class}">${event.status.name}</span></td>
            <td>${event.details}</td>
            <td>
                <button class="btn btn-primary">查看</button>
                <button class="btn btn-secondary">处理</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染首页图表
function renderCharts(data) {
    // 生成图表数据
    const hours = Array.from({ length: 12 }, (_, i) => i + 8);
    const passengerFlowData = hours.map(() => Math.floor(Math.random() * 200) + 50);
    const contrabandData = hours.map(() => Math.floor(Math.random() * 20) + 2);
    
    const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#722ed1'];
    
    drawChart('passengerFlowChart', '每小时客流', passengerFlowData, hours.map(h => `${h}时`), colors);
    drawChart('contrabandChart', '每小时违禁品检测', contrabandData, hours.map(h => `${h}时`), colors);
}

// 加载首页数据
function loadDashboardData() {
    const data = generateMockData();
    renderStats(data.stats);
    renderEvents(data.events.slice(0, 10));
    renderCharts(data);
}

// 当首页模块显示时加载数据
const dashboardModule = document.getElementById('dashboard');
if (dashboardModule) {
    // 初始加载
    loadDashboardData();
    
    // 监听模块显示事件（如果需要）
    dashboardModule.addEventListener('DOMNodeInsertedIntoDocument', loadDashboardData);
}