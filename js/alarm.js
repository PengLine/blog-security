import { getStore, handleAlarmById } from './db.js';
import { paginateData, toast, openModal, kvTableHTML, timeAgo, refreshNavBadges } from './utils.js';

// 告警级别映射
const alarmLevelMap = {
    danger: { name: '危险', class: 'alarm-danger' },
    warning: { name: '警告', class: 'alarm-warning' },
    info: { name: '信息', class: 'alarm-info' }
};

// 分页变量
let currentAlarmPage = 1;
const alarmsPerPage = 20;
let filteredAlarms = [];

// 应用筛选并渲染
function applyFilters() {
    const store = getStore();
    const level = document.getElementById('alarmLevelFilter').value;
    const status = document.getElementById('alarmStatusFilter').value;

    filteredAlarms = store.alarms.filter(a => {
        if (level && a.level !== level) return false;
        if (status && a.status !== status) return false;
        return true;
    });
    currentAlarmPage = 1;
    renderAlarms(paginateData(filteredAlarms, currentAlarmPage, alarmsPerPage));
    updateAlarmStats(filteredAlarms);
    renderAlarmPagination();
    refreshNavBadges();
}

// 渲染告警列表
function renderAlarms(alarms) {
    const tbody = document.getElementById('alarmsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    alarms.forEach(alarm => {
        const level = alarmLevelMap[alarm.level];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="alarm-checkbox" data-id="${alarm.id}"></td>
            <td>${alarm.id}</td>
            <td>${alarm.time}<div style="font-size:11px;color:#909399">${timeAgo(alarm.ts)}</div></td>
            <td>${alarm.device}</td>
            <td><span class="alarm-level ${level.class}">${level.name}</span></td>
            <td>${alarm.content}</td>
            <td>
                <span class="status-tag ${alarm.status === '已处理' ? 'status-normal' : 'status-danger'}">${alarm.status}</span>
                ${alarm.operator ? `<div style="font-size:11px;color:#909399">${alarm.operator}</div>` : ''}
            </td>
            <td>
                ${alarm.status === '未处理' ? 
                    `<button class="btn btn-small btn-primary" data-handle="${alarm.id}">处理</button>` : 
                    `<button class="btn btn-small btn-primary" data-view="${alarm.id}">查看</button>`
                }
                <button class="btn btn-small btn-secondary" data-view="${alarm.id}">详情</button>
                <button class="btn btn-small btn-danger" data-del="${alarm.id}">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-handle]').forEach(btn => btn.onclick = () => showHandleForm(btn.dataset.handle));
    tbody.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => viewAlarmDetail(btn.dataset.view));
    tbody.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => deleteAlarm(btn.dataset.del));
}

// 渲染告警分页
function renderAlarmPagination() {
    const moduleDiv = document.getElementById('alarm');
    if (!moduleDiv) return;
    
    const tableSection = moduleDiv.querySelector('.table-section');
    if (!tableSection) return;
    
    let paginationDiv = tableSection.querySelector('.pagination-page');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-page';
        tableSection.appendChild(paginationDiv);
    }
    
    const totalPages = Math.ceil(filteredAlarms.length / alarmsPerPage);
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    paginationDiv.innerHTML = `
        <button class="btn btn-secondary" ${currentAlarmPage <= 1 ? 'disabled' : ''} id="almPrev">上一页</button>
        <span class="page-info">第 ${currentAlarmPage} 页，共 ${totalPages} 页（${filteredAlarms.length} 条）</span>
        <button class="btn btn-secondary" ${currentAlarmPage >= totalPages ? 'disabled' : ''} id="almNext">下一页</button>
    `;
    document.getElementById('almPrev').onclick = () => {
        if (currentAlarmPage > 1) { currentAlarmPage--; renderAlarms(paginateData(filteredAlarms, currentAlarmPage, alarmsPerPage)); renderAlarmPagination(); }
    };
    document.getElementById('almNext').onclick = () => {
        if (currentAlarmPage < totalPages) { currentAlarmPage++; renderAlarms(paginateData(filteredAlarms, currentAlarmPage, alarmsPerPage)); renderAlarmPagination(); }
    };
}

// 更新告警统计信息（基于全量数据）
function updateAlarmStats() {
    const store = getStore();
    const all = store.alarms;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('totalAlarms', all.length);
    set('dangerAlarms', all.filter(a => a.level === 'danger').length);
    set('warningAlarms', all.filter(a => a.level === 'warning').length);
    set('infoAlarms', all.filter(a => a.level === 'info').length);
    set('unhandledAlarms', all.filter(a => a.status === '未处理').length);
}

// 处理告警（表单弹窗，落库）
function showHandleForm(alarmId) {
    const store = getStore();
    const alarm = store.alarms.find(a => a.id === alarmId);
    if (!alarm) return;
    openModal({
        title: `处理告警 - ${alarm.id}`,
        width: 540,
        bodyHTML: `
            <div class="form-grid">
                <label>告警内容</label><input class="form-control" value="${alarm.content}" disabled>
                <label>级别</label><input class="form-control" value="${alarmLevelMap[alarm.level].name}级 · ${alarm.device}" disabled>
                <label>处理人</label><input class="form-control" value="值班队长·${store.currentUser.name}" disabled>
                <label>处理措施</label><textarea class="form-control" id="almHandleNote" rows="3" placeholder="如：已现场确认、已通知厂商、误报已恢复"></textarea>
            </div>`,
        actions: [{
            label: '确认处理', className: 'btn-success',
            onClick: (close, mask) => {
                const note = mask.querySelector('#almHandleNote').value;
                handleAlarmById(alarm.id, store.currentUser.name, note);
                toast(`告警 ${alarm.id} 已处理闭环`, 'success');
                close();
                applyFilters();
            }
        }]
    });
}

// 查看告警详情（联动包裹 / 交接单）
function viewAlarmDetail(alarmId) {
    const store = getStore();
    const alarm = store.alarms.find(a => a.id === alarmId);
    if (!alarm) return;
    const bag = alarm.refId ? store.bags.find(b => b.id === alarm.refId) : null;
    const ho = bag ? store.handoffs.find(h => h.bagId === bag.id) : null;
    openModal({
        title: `告警详情 - ${alarm.id}`,
        width: 600,
        bodyHTML: kvTableHTML([
            ['告警时间', `${alarm.time}（${timeAgo(alarm.ts)}）`],
            ['告警设备', alarm.device],
            ['告警级别', alarmLevelMap[alarm.level].name],
            ['告警内容', alarm.content],
            ['补充说明', alarm.details],
            ['处理状态', alarm.status],
            ['处理人 / 时间', alarm.operator ? `${alarm.operator} · ${alarm.handleTime}` : ''],
            ['处理措施', alarm.handleNote || (alarm.status === '已处理' ? '现场处置完毕' : '')],
            ['关联包裹', bag ? `${bag.id}（${bag.ownerName}）` : ''],
            ['关联交接单', ho ? `${ho.id}（${ho.status}）` : '']
        ]),
        actions: ho && ho.status !== '已完成' ? [{
            label: '前往处置交接', className: 'btn-danger',
            onClick: (close) => { close(); document.querySelector('.nav-item[data-nav="handoff"]').click(); }
        }] : []
    });
}

// 删除告警
function deleteAlarm(alarmId) {
    const store = getStore();
    openModal({
        title: '删除确认',
        width: 420,
        bodyHTML: `<p>确定删除告警 <b style="color:#f56c6c">${alarmId}</b> 吗？删除后不可恢复。</p>`,
        actions: [{
            label: '删除', className: 'btn-danger',
            onClick: (close) => {
                store.alarms = store.alarms.filter(a => a.id !== alarmId);
                toast(`告警 ${alarmId} 已删除`, 'info');
                close();
                applyFilters();
            }
        }]
    });
}

// 设置全选功能
function setupSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllAlarms');
    if (!selectAllCheckbox) return;
    selectAllCheckbox.onchange = (e) => {
        document.querySelectorAll('.alarm-checkbox').forEach(cb => { cb.checked = e.target.checked; });
    };
}

// 设置批量处理功能（真实落库）
function setupBatchHandle() {
    const batchHandleBtn = document.getElementById('batchHandleBtn');
    if (!batchHandleBtn) return;
    batchHandleBtn.onclick = () => {
        const ids = Array.from(document.querySelectorAll('.alarm-checkbox:checked')).map(cb => cb.dataset.id);
        if (ids.length === 0) { toast('请先勾选要处理的告警', 'warning'); return; }
        const store = getStore();
        openModal({
            title: `批量处理 ${ids.length} 条告警`,
            width: 480,
            bodyHTML: `
                <div class="form-grid">
                    <label>处理人</label><input class="form-control" value="值班队长·${store.currentUser.name}" disabled>
                    <label>统一意见</label><textarea class="form-control" id="almBatchNote" rows="2" placeholder="批量处理措施，如：早班巡检问题已集中整改"></textarea>
                </div>`,
            actions: [{
                label: '确认处理', className: 'btn-success',
                onClick: (close, mask) => {
                    const note = mask.querySelector('#almBatchNote').value;
                    let count = 0;
                    ids.forEach(id => { if (handleAlarmById(id, store.currentUser.name, note)) count++; });
                    toast(`批量处理完成：${count} 条告警已闭环`, 'success');
                    close();
                    applyFilters();
                }
            }]
        });
    };
}

// 全局初始化函数
window.initAlarmModule = function() {
    document.getElementById('alarmLevelFilter').onchange = applyFilters;
    document.getElementById('alarmStatusFilter').onchange = applyFilters;
    setupSelectAll();
    setupBatchHandle();
    applyFilters();
};
