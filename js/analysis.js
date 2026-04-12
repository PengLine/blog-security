import { generateMockData, drawChart } from './utils.js';

// 加载统计数据
function loadAnalysisData() {
    const data = generateMockData();
    updateStats(data);
    renderAnalysisCharts(data);
    renderAnalysisTable(data);
}

// 当统计分析模块显示时加载数据
const analysisModule = document.getElementById('analysis');
if (analysisModule) {
    // 初始加载
    loadAnalysisData();
    
    // 设置筛选和操作事件
    setupAnalysisActions();
}

// 更新统计卡片
export function updateStats(data) {
    // 更新总客流
    const totalPassenger = document.getElementById('totalPassenger');
    if (totalPassenger) {
        totalPassenger.textContent = data.stats[0].value;
    }
    
    // 更新违禁品数量
    const totalContraband = document.getElementById('totalContraband');
    if (totalContraband) {
        totalContraband.textContent = data.stats[1].value;
    }
    
    // 更新设备在线率
    const deviceOnlineRate = document.getElementById('deviceOnlineRate');
    if (deviceOnlineRate) {
        deviceOnlineRate.textContent = `${data.stats[3].value}%`;
    }
    
    // 计算事件处理率
    const processedEvents = data.events.filter(event => event.processStatus === '已处理').length;
    const eventProcessRate = document.getElementById('eventProcessRate');
    if (eventProcessRate) {
        eventProcessRate.textContent = `${((processedEvents / data.events.length) * 100).toFixed(1)}%`;
    }
}

// 渲染分析图表
export function renderAnalysisCharts(data) {
    // 客流趋势图
    const passengerCtx = document.getElementById('passengerChart');
    if (passengerCtx) {
        const passengerData = generatePassengerChartData();
        drawChart(passengerCtx, passengerData, { type: 'line', title: '客流趋势' });
    }
    
    // 违禁品分类图
    const contrabandCtx = document.getElementById('contrabandChart');
    if (contrabandCtx) {
        const contrabandData = generateContrabandChartData();
        drawChart(contrabandCtx, contrabandData, { type: 'pie', title: '违禁品分类' });
    }
    
    // 设备状态分布图
    const deviceStatusCtx = document.getElementById('deviceStatusChart');
    if (deviceStatusCtx) {
        const deviceStatusData = generateDeviceStatusChartData(data);
        drawChart(deviceStatusCtx, deviceStatusData, { type: 'doughnut', title: '设备状态分布' });
    }
    
    // 事件类型统计图
    const eventTypeCtx = document.getElementById('eventTypeChart');
    if (eventTypeCtx) {
        const eventTypeData = generateEventTypeChartData(data);
        drawChart(eventTypeCtx, eventTypeData, { type: 'bar', title: '事件类型统计' });
    }
}

// 生成客流趋势图数据
function generatePassengerChartData() {
    const hours = [];
    const values = [];
    const now = new Date();
    
    // 生成过去24小时的数据
    for (let i = 23; i >= 0; i--) {
        const hour = new Date(now.getTime() - i * 3600000);
        hours.push(`${hour.getHours()}:00`);
        values.push(Math.floor(Math.random() * 500) + 100);
    }
    
    return {
        labels: hours,
        datasets: [{
            label: '客流',
            data: values,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            fill: true
        }]
    };
}

// 生成违禁品分类图数据
function generateContrabandChartData() {
    return {
        labels: ['刀具', '液体', '电池', '其他'],
        datasets: [{
            data: [35, 25, 15, 25],
            backgroundColor: ['#e74c3c', '#f39c12', '#3498db', '#2ecc71']
        }]
    };
}

// 生成设备状态分布图数据
function generateDeviceStatusChartData(data) {
    const onlineCount = data.devices.filter(device => device.status.name === '在线').length;
    const warningCount = data.devices.filter(device => device.status.name === '告警').length;
    const offlineCount = data.devices.filter(device => device.status.name === '离线').length;
    
    return {
        labels: ['在线', '告警', '离线'],
        datasets: [{
            data: [onlineCount, warningCount, offlineCount],
            backgroundColor: ['#2ecc71', '#f39c12', '#e74c3c']
        }]
    };
}

// 生成事件类型统计图数据
function generateEventTypeChartData(data) {
    // 统计不同类型的事件数量
    const eventTypeStats = {};
    data.events.forEach(event => {
        if (!eventTypeStats[event.typeCode]) {
            eventTypeStats[event.typeCode] = 0;
        }
        eventTypeStats[event.typeCode]++;
    });
    
    // 类型映射
    const typeMap = {
        passenger: '乘客',
        metal: '金属',
        contraband: '违禁品',
        face: '人脸'
    };
    
    return {
        labels: Object.keys(eventTypeStats).map(type => typeMap[type] || type),
        datasets: [{
            label: '事件数量',
            data: Object.values(eventTypeStats),
            backgroundColor: '#3498db'
        }]
    };
}

// 渲染分析表格
function renderAnalysisTable(data) {
    const tbody = document.getElementById('analysisTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // 生成过去24小时的详细数据
    for (let i = 23; i >= 0; i -= 2) {
        const hour = new Date(Date.now() - i * 3600000);
        const timeStr = `${hour.getHours()}:00 - ${(hour.getHours() + 2) % 24}:00`;
        const passengerCount = Math.floor(Math.random() * 1000) + 500;
        const contrabandCount = Math.floor(Math.random() * 20) + 1;
        const alarmCount = Math.floor(Math.random() * 50) + 5;
        const onlineDeviceCount = Math.floor(Math.random() * 5) + 8;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${timeStr}</td>
            <td>${passengerCount}</td>
            <td>${contrabandCount}</td>
            <td>${alarmCount}</td>
            <td>${onlineDeviceCount}/11</td>
        `;
        tbody.appendChild(row);
    }
}

// 设置分析模块操作事件
function setupAnalysisActions() {
    const refreshBtn = document.getElementById('refreshBtn');
    const exportBtn = document.getElementById('exportBtn');
    const timeRangeFilter = document.getElementById('timeRangeFilter');
    
    // 刷新按钮
    refreshBtn.addEventListener('click', () => {
        loadAnalysisData();
    });
    
    // 导出按钮
    exportBtn.addEventListener('click', () => {
        alert('导出报表功能开发中...');
    });
    
    // 时间范围筛选
    timeRangeFilter.addEventListener('change', () => {
        // 根据时间范围重新加载数据
        loadAnalysisData();
    });
}
