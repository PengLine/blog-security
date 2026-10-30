import { getStore, processEventById } from './db.js';
import { paginateData, toast, openModal, kvTableHTML, exportCSV, timeAgo } from './utils.js';

// 分页变量
let currentEventPage = 1;
const eventsPerPage = 20;
let filteredEvents = [];

const statusNameMap = {
    'status-normal': '正常',
    'status-warning': '警告',
    'status-danger': '危险',
    'status-processing': '处理中'
};

// 应用筛选
function applyFilters() {
    const store = getStore();
    const type = document.getElementById('eventTypeFilter').value;
    const status = document.getElementById('eventStatusFilter').value;
    const process = document.getElementById('eventProcessFilter').value;
    const keyword = document.getElementById('eventKeyword').value.trim();

    filteredEvents = store.events.filter(e => {
        if (type && e.type !== type) return false;
        if (status && e.status !== status) return false;
        if (process && e.processStatus !== process) return false;
        if (keyword && !(e.id + e.device + e.details).includes(keyword)) return false;
        return true;
    });
    currentEventPage = 1;
    renderEvents(paginateData(filteredEvents, currentEventPage, eventsPerPage));
    renderEventPagination();
}

// 渲染事件列表
function renderEvents(events) {
    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    events.forEach(event => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${event.id}</td>
            <td>${event.time}<div style="font-size:11px;color:#909399">${timeAgo(event._ts)}</div></td>
            <td>${event.device}</td>
            <td>${event.type}</td>
            <td><span class="status-tag ${event.status}">${statusNameMap[event.status] || ''}</span></td>
            <td>${event.details}</td>
            <td>${event.processStatus}${event.handler ? `<div style="font-size:11px;color:#909399">${event.handler}</div>` : ''}</td>
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
            const evt = getStore().events.find(e => e.id === btn.dataset.handle);
            if (!evt) return;
            openModal({
                title: `处理事件 - ${evt.id}`,
                width: 520,
                bodyHTML: `
                    <div class="form-grid">
                        <label>事件</label><input class="form-control" value="${evt.type}：${evt.details}" disabled>
                        <label>处理人</label><input class="form-control" value="${store.currentUser.name}（${store.currentUser.role}）" disabled>
                        <label>处理意见</label><textarea class="form-control" id="evtHandleNote" rows="3" placeholder="填写处理措施，如：已引导复测 / 已通知设备厂商"></textarea>
                    </div>`,
                actions: [{
                    label: '确认处理', className: 'btn-success',
                    onClick: (close, mask) => {
                        evt.handleNote = mask.querySelector('#evtHandleNote').value;
                        processEventById(evt.id, store.currentUser.name);
                        toast(`事件 ${evt.id} 已处理`, 'success');
                        close();
                        applyFilters();
                    }
                }]
            });
        };
    });
}

// 事件详情（关联包裹 / 旅客 / 交接单）
function showEventDetail(evt) {
    const store = getStore();
    const bagMatch = evt.details.match(/PKG-\d{8}-\d+/);
    const bag = bagMatch ? store.bags.find(b => b.id === bagMatch[0]) : null;
    const ho = bag ? store.handoffs.find(h => h.bagId === bag.id) : null;
    openModal({
        title: `事件详情 - ${evt.id}`,
        width: 620,
        bodyHTML: kvTableHTML([
            ['事件时间', `${evt.time}（${timeAgo(evt._ts)}）`],
            ['触发设备', evt.device],
            ['事件类型', evt.type],
            ['处理状态', `${evt.processStatus}${evt.handler ? `（${evt.handler} 于 ${evt.handleTime || ''}）` : ''}`],
            ['处理意见', evt.handleNote || (evt.processStatus === '已处理' ? '现场处置完毕' : '')],
            ['事件详情', evt.details],
            ['关联旅客', evt.passengerId || '-'],
            bag ? ['关联包裹', `${bag.id}（${bag.channelName} / ${bag.weightKg}kg）`] : null,
            bag ? ['判图处置', `${bag.judgeResult || '待判图'} / ${bag.disposition || '-'}`] : null,
            ho ? ['交接单', `${ho.id}（${ho.status}）`] : null
        ])
    });
}

// 渲染事件分页
function renderEventPagination() {
    const moduleDiv = document.getElementById('events');
    if (!moduleDiv) return;

    const tableSection = moduleDiv.querySelector('.table-section');
    if (!tableSection) return;

    let paginationDiv = tableSection.querySelector('.pagination-page');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-page';
        tableSection.appendChild(paginationDiv);
    }

    const totalPages = Math.ceil(filteredEvents.length / eventsPerPage);
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    paginationDiv.innerHTML = `
        <button class="btn btn-secondary" ${currentEventPage <= 1 ? 'disabled' : ''} id="evtPrev">上一页</button>
        <span class="page-info">第 ${currentEventPage} 页，共 ${totalPages} 页（${filteredEvents.length} 条）</span>
        <button class="btn btn-secondary" ${currentEventPage >= totalPages ? 'disabled' : ''} id="evtNext">下一页</button>
    `;
    document.getElementById('evtPrev').onclick = () => {
        if (currentEventPage > 1) { currentEventPage--; renderEvents(paginateData(filteredEvents, currentEventPage, eventsPerPage)); renderEventPagination(); }
    };
    document.getElementById('evtNext').onclick = () => {
        if (currentEventPage < totalPages) { currentEventPage++; renderEvents(paginateData(filteredEvents, currentEventPage, eventsPerPage)); renderEventPagination(); }
    };
}

// 全局初始化函数
window.initEventsModule = function() {
    ['eventTypeFilter', 'eventStatusFilter', 'eventProcessFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onchange = applyFilters;
    });
    const kw = document.getElementById('eventKeyword');
    if (kw) kw.onkeydown = (e) => { if (e.key === 'Enter') applyFilters(); };
    const searchBtn = document.getElementById('eventSearchBtn');
    if (searchBtn) searchBtn.onclick = applyFilters;
    const exportBtn = document.getElementById('eventExportBtn');
    if (exportBtn) exportBtn.onclick = () => {
        exportCSV(`事件台账_${new Date().toISOString().slice(0, 10)}.csv`,
            ['事件ID', '时间', '设备', '类型', '详情', '处理状态'],
            filteredEvents.map(e => [e.id, e.time, e.device, e.type, e.details, e.processStatus]));
    };

    applyFilters();
};
