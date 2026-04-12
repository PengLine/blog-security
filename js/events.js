import { generateMockData } from './utils.js';

// 渲染事件列表
function renderEvents(events, tableId = 'eventsTableBody') {
    const eventsTable = document.getElementById(tableId);
    if (!eventsTable) return;
    
    const tbody = eventsTable;
    tbody.innerHTML = '';

    events.forEach(event => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${event.id}</td>
            <td>${event.time}</td>
            <td>${event.device}</td>
            <td>${event.type}</td>
            <td><span class="status-tag ${event.status.class}">${event.status.name}</span></td>
            <td>${event.details}</td>
            <td>${event.processStatus}</td>
            <td>
                <button class="btn btn-primary">查看</button>
                <button class="btn btn-secondary">处理</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 加载事件中心数据
function loadEventsData() {
    const data = generateMockData();
    renderEvents(data.events);
}

// 当事件中心模块显示时加载数据
const eventsModule = document.getElementById('events');
if (eventsModule) {
    // 初始加载
    loadEventsData();
    
    // 监听模块显示事件（如果需要）
    eventsModule.addEventListener('DOMNodeInsertedIntoDocument', loadEventsData);
}