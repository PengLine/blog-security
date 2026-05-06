import { generateMockData, paginateData } from './utils.js';

// 分页变量
let currentEventPage = 1;
const eventsPerPage = 20;
let allEvents = [];

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

// 渲染事件分页
function renderEventPagination() {
    const moduleDiv = document.getElementById('events');
    if (!moduleDiv) {
        console.error('事件中心模块未找到');
        return;
    }
    
    const tableSection = moduleDiv.querySelector('.table-section');
    if (!tableSection) {
        console.error('事件中心表格区域未找到');
        return;
    }
    
    let paginationDiv = tableSection.querySelector('.pagination-page');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-page';
        tableSection.appendChild(paginationDiv);
    }
    
    const totalPages = Math.ceil(allEvents.length / eventsPerPage);
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    paginationDiv.innerHTML = `
        <button class="btn btn-secondary" ${currentEventPage <= 1 ? 'disabled' : ''} onclick="window.changeEventPage(${currentEventPage - 1})">上一页</button>
        <span class="page-info">第 ${currentEventPage} 页，共 ${totalPages} 页</span>
        <button class="btn btn-secondary" ${currentEventPage >= totalPages ? 'disabled' : ''} onclick="window.changeEventPage(${currentEventPage + 1})">下一页</button>
    `;
}

// 切换事件页码
window.changeEventPage = function(page) {
    currentEventPage = page;
    renderEvents(paginateData(allEvents, currentEventPage, eventsPerPage));
    renderEventPagination();
};

// 全局初始化函数
window.initEventsModule = function() {
    loadEventsData();
};

// 加载事件中心数据
function loadEventsData() {
    const data = generateMockData();
    allEvents = data.events;
    renderEvents(paginateData(allEvents, currentEventPage, eventsPerPage));
    renderEventPagination();
}

// 当事件中心模块显示时加载数据
const eventsModule = document.getElementById('events');
if (eventsModule) {
    // 初始加载
    loadEventsData();
    
    // 监听模块显示事件（如果需要）
    eventsModule.addEventListener('DOMNodeInsertedIntoDocument', loadEventsData);
}