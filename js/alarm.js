import { getStore, disposeAlarm, ALARM_DISPOSITIONS, onDutyEmployees } from './db.js';
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
                <span class="status-tag ${alarm.status === '已处理' ? 'status-normal' : (alarm.status === '已忽略' ? 'status-warning' : 'status-danger')}">${alarm.status}</span>
                ${alarm.dispositionName ? `<div style="font-size:11px;color:#909399">${alarm.dispositionName}</div>` : ''}
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
    set('ignoredAlarms', all.filter(a => a.status === '已忽略').length);
}

// 当前当班队长
function captainName() {
    const list = onDutyEmployees('值班队长');
    return list.length ? list[0].name : '王振宇';
}

// 告警可联动对象：关联包裹 / 匹配设备
function alarmTargets(alarm, store) {
    const bag = alarm.refId ? store.bags.find(b => b.id === alarm.refId) : null;
    const dev = store.devices.find(d => d.displayName === alarm.device || d.name === alarm.device || d.location === alarm.device) || null;
    return { bag, dev };
}

// 处置告警：通过 / 忽略 / 转复检 / 转开包 / 转维保
function showHandleForm(alarmId) {
    const store = getStore();
    const alarm = store.alarms.find(a => a.id === alarmId);
    if (!alarm) return;
    if (alarm.status !== '未处理') { toast(`该告警当前为「${alarm.status}」，无需重复处置`, 'info'); return; }
    const { bag, dev } = alarmTargets(alarm, store);
    const captain = captainName();
    const usable = ALARM_DISPOSITIONS.filter(d => (!d.needBag || (bag && !bag.seized)) && (!d.needDevice || dev));
    openModal({
        title: `处置告警 - ${alarm.id}`,
        width: 640,
        bodyHTML: `
            <div class="disp-summary">
                <div class="disp-summary-main">
                    <span class="alarm-level ${alarmLevelMap[alarm.level].class}">${alarmLevelMap[alarm.level].name}</span>
                    <b>${alarm.content}</b>
                </div>
                <div class="disp-summary-sub">${alarm.device} · ${alarm.type} · ${alarm.time}${bag ? ` · 关联包裹 ${bag.id}` : ''}${dev ? ` · 匹配设备 ${dev.displayName}` : ''}</div>
            </div>
            <div class="disp-grid">
                ${usable.map((d, i) => `
                    <label class="disp-option">
                        <input type="radio" name="almDisp" value="${d.key}" ${i === 0 ? 'checked' : ''}>
                        <span class="disp-label">${d.label}</span>
                        <small>${d.desc}</small>
                    </label>`).join('')}
            </div>
            <div class="form-grid" style="margin-top:14px">
                <label>处置人</label><input class="form-control" value="值班队长·${captain}" disabled>
                <label>处置说明</label><textarea class="form-control" id="almHandleNote" rows="2" placeholder="如：开包检查为化妆品误报；或安抚旅客后放行"></textarea>
            </div>`,
        actions: [{
            label: '确认处置', className: 'btn-success',
            onClick: (close, mask) => {
                const checked = mask.querySelector('input[name="almDisp"]:checked');
                if (!checked) { toast('请选择处置方式', 'warning'); return; }
                const note = mask.querySelector('#almHandleNote').value.trim();
                const r = disposeAlarm(alarm.id, checked.value, captain, note);
                if (!r.ok) { toast(r.msg, 'warning'); return; }
                close();
                applyFilters();
                showDisposeResult(r);
            }
        }]
    });
}

// 处置结果回显：转复检/转维保可直接跳转对应模块
function showDisposeResult(r) {
    const actions = [];
    if (r.target === 'recheck') {
        actions.push({ label: '前往复检开包', className: 'btn-primary', onClick: (close) => { close(); document.querySelector('.nav-item[data-nav="recheck"]').click(); } });
    }
    if (r.order) {
        actions.push({ label: '查看维修工单', className: 'btn-primary', onClick: (close) => { close(); document.querySelector('.nav-item[data-nav="workorder"]').click(); } });
    }
    openModal({
        title: '处置完成',
        width: 500,
        bodyHTML: `
            <div class="disp-result">
                <div class="disp-result-icon">✓</div>
                <div><b>${r.alarm.id}</b> 已按「${r.alarm.dispositionName}」闭环</div>
                <div class="disp-result-note">${r.result}${r.alarm.handleNote ? `<br>说明：${r.alarm.handleNote}` : ''}</div>
            </div>`,
        actions
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
            ['处理状态', `${alarm.status}${alarm.dispositionName ? `（${alarm.dispositionName}）` : ''}`],
            ['处理人 / 时间', alarm.operator ? `${alarm.operator} · ${alarm.handleTime}` : ''],
            ['处置结果', alarm.handleResult || ''],
            ['处置说明', alarm.handleNote || ''],
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

// 设置批量处置：仅支持批量通过 / 批量忽略（复检、开包、维保需逐条确认）
function setupBatchHandle() {
    const batchHandleBtn = document.getElementById('batchHandleBtn');
    if (!batchHandleBtn) return;
    batchHandleBtn.onclick = () => {
        const ids = Array.from(document.querySelectorAll('.alarm-checkbox:checked')).map(cb => cb.dataset.id);
        if (ids.length === 0) { toast('请先勾选要处置的告警', 'warning'); return; }
        const captain = captainName();
        openModal({
            title: `批量处置 ${ids.length} 条告警`,
            width: 520,
            bodyHTML: `
                <div class="disp-grid disp-grid-compact">
                    <label class="disp-option">
                        <input type="radio" name="almBatchDisp" value="pass" checked>
                        <span class="disp-label">通过放行</span>
                        <small>批量核实无风险，直接归档</small>
                    </label>
                    <label class="disp-option">
                        <input type="radio" name="almBatchDisp" value="ignore">
                        <span class="disp-label">忽略（误报）</span>
                        <small>批量标记为误报，计入误报统计</small>
                    </label>
                </div>
                <div class="form-grid" style="margin-top:12px">
                    <label>处置人</label><input class="form-control" value="值班队长·${captain}" disabled>
                    <label>统一说明</label><textarea class="form-control" id="almBatchNote" rows="2" placeholder="如：早班巡检问题已集中整改"></textarea>
                </div>`,
            actions: [{
                label: '确认处置', className: 'btn-success',
                onClick: (close, mask) => {
                    const key = mask.querySelector('input[name="almBatchDisp"]:checked').value;
                    const note = mask.querySelector('#almBatchNote').value.trim();
                    let ok = 0, skip = 0;
                    ids.forEach(id => { const r = disposeAlarm(id, key, captain, note); r.ok ? ok++ : skip++; });
                    toast(`批量处置完成：成功 ${ok} 条${skip ? `，跳过 ${skip} 条` : ''}`, ok ? 'success' : 'warning');
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
