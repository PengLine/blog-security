import { generateMockData } from './utils.js';

// 告警级别映射
const alarmLevelMap = {
    danger: { name: '危险', class: 'alarm-danger' },
    warning: { name: '警告', class: 'alarm-warning' },
    info: { name: '信息', class: 'alarm-info' }
};

// 加载告警数据
function loadAlarms() {
    const data = generateMockData();
    renderAlarms(data.alarms);
    updateAlarmStats(data.alarms);
}

// 当告警中心模块显示时加载数据
const alarmModule = document.getElementById('alarm');
if (alarmModule) {
    // 初始加载
    loadAlarms();
    
    // 设置筛选功能
    setupFilters();
    
    // 设置全选功能
    setupSelectAll();
    
    // 设置批量处理功能
    setupBatchHandle();
}

// 加载告警数据
function loadAlarms() {
    const data = generateMockData();
    renderAlarms(data.alarms);
    updateAlarmStats(data.alarms);
}

// 渲染告警列表
export function renderAlarms(alarms) {
    const tbody = document.getElementById('alarmsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    alarms.forEach(alarm => {
        const level = alarmLevelMap[alarm.level];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="alarm-checkbox" data-id="${alarm.id}"></td>
            <td>${alarm.id}</td>
            <td>${alarm.time}</td>
            <td>${alarm.device}</td>
            <td><span class="alarm-level ${level.class}">${level.name}</span></td>
            <td>${alarm.content}</td>
            <td><span class="status-${alarm.status === '已处理' ? 'normal' : 'danger'}">${alarm.status}</span></td>
            <td>
                ${alarm.status === '未处理' ? 
                    `<button class="btn btn-small btn-primary" onclick="handleAlarm('${alarm.id}')">处理</button>` : 
                    `<button class="btn btn-small btn-info" onclick="viewAlarmDetail('${alarm.id}')">查看</button>`
                }
                <button class="btn btn-small btn-danger" onclick="deleteAlarm('${alarm.id}')">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 更新告警统计信息
function updateAlarmStats(alarms) {
    // 总告警数
    document.getElementById('totalAlarms').textContent = alarms.length;
    
    // 危险告警数
    const dangerCount = alarms.filter(alarm => alarm.level === 'danger').length;
    document.getElementById('dangerAlarms').textContent = dangerCount;
    
    // 警告告警数
    const warningCount = alarms.filter(alarm => alarm.level === 'warning').length;
    document.getElementById('warningAlarms').textContent = warningCount;
    
    // 信息告警数
    const infoCount = alarms.filter(alarm => alarm.level === 'info').length;
    document.getElementById('infoAlarms').textContent = infoCount;
    
    // 未处理告警数
    const unhandledCount = alarms.filter(alarm => alarm.status === '未处理').length;
    document.getElementById('unhandledAlarms').textContent = unhandledCount;
}

// 设置筛选功能
function setupFilters() {
    const filterBtn = document.getElementById('filterBtn');
    const resetBtn = document.getElementById('resetBtn');
    const levelFilter = document.getElementById('alarmLevelFilter');
    const statusFilter = document.getElementById('alarmStatusFilter');
    
    filterBtn.addEventListener('click', () => {
        const data = generateMockData();
        let filteredAlarms = [...data.alarms];
        
        // 按级别筛选
        const levelValue = levelFilter.value;
        if (levelValue) {
            filteredAlarms = filteredAlarms.filter(alarm => alarm.level === levelValue);
        }
        
        // 按状态筛选
        const statusValue = statusFilter.value;
        if (statusValue) {
            filteredAlarms = filteredAlarms.filter(alarm => alarm.status === statusValue);
        }
        
        renderAlarms(filteredAlarms);
        updateAlarmStats(filteredAlarms);
    });
    
    resetBtn.addEventListener('click', () => {
        levelFilter.value = '';
        statusFilter.value = '';
        loadAlarms();
    });
}

// 设置全选功能
function setupSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllAlarms');
    
    selectAllCheckbox.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.alarm-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = e.target.checked;
        });
    });
}

// 设置批量处理功能
function setupBatchHandle() {
    const batchHandleBtn = document.getElementById('batchHandleBtn');
    
    batchHandleBtn.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.alarm-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('请选择要处理的告警');
            return;
        }
        
        if (confirm(`确定要批量处理选中的 ${checkboxes.length} 个告警吗？`)) {
            // 模拟批量处理
            checkboxes.forEach(checkbox => {
                const alarmId = checkbox.dataset.id;
                // 这里可以实现真正的批量处理逻辑
                console.log(`批量处理告警：${alarmId}`);
            });
            
            // 重新加载数据
            loadAlarms();
            alert('批量处理完成');
        }
    });
}

// 处理单个告警
window.handleAlarm = function(alarmId) {
    if (confirm(`确定要处理告警 ${alarmId} 吗？`)) {
        // 模拟处理告警
        console.log(`处理告警：${alarmId}`);
        // 重新加载数据
        loadAlarms();
        alert('告警处理完成');
    }
};

// 查看告警详情
window.viewAlarmDetail = function(alarmId) {
    alert(`查看告警 ${alarmId} 的详情`);
    // 这里可以实现查看告警详情的逻辑
};

// 删除告警
window.deleteAlarm = function(alarmId) {
    if (confirm(`确定要删除告警 ${alarmId} 吗？`)) {
        // 模拟删除告警
        console.log(`删除告警：${alarmId}`);
        // 重新加载数据
        loadAlarms();
        alert('告警删除完成');
    }
};
