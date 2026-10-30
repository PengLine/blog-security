import {
    getStore, disposeAlarm, ALARM_DISPOSITIONS, onDutyEmployees,
    alarmLevelOf, alarmLevelText, alarmItemLevels, alarmDeviceKeyOf, alarmDeviceGroups,
    itemRanking, itemLevelStats, itemLevelInfo, getItemCatalog
} from './db.js';
import { paginateData, toast, openModal, kvTableHTML, timeAgo, refreshNavBadges } from './utils.js';

// 告警级别映射：级别由包内最高物品等级推导（高→danger / 中→warning / 低→info）
const alarmLevelMap = {
    danger: { name: '高危', class: 'alarm-danger' },
    warning: { name: '中风险', class: 'alarm-warning' },
    info: { name: '提示', class: 'alarm-info' }
};

// 左侧设备筛选 + 物品排行等级筛选
const state = { deviceKey: '', rankLevel: '' };

let currentAlarmPage = 1;
const alarmsPerPage = 20;
let filteredAlarms = [];

const byId = id => document.getElementById(id);

// 物品标签：等级实时取自配置中心，调整等级后此处立即变色
function itemChips(alarm, store) {
    const items = alarmItemLevels(alarm, store);
    if (!items.length) return '<span class="item-none">非包裹类</span>';
    return items.map(it => {
        const meta = itemLevelInfo(it.level);
        return `<span class="item-chip is-${it.level}" title="${it.category} · ${meta.tag} · 置信度 ${it.confidence || '-'}%">
            ${it.name}${it.qty > 1 ? ` ×${it.qty}` : ''}</span>`;
    }).join('');
}

// 应用筛选（设备 / 级别 / 物品等级 / 物品 / 状态）
function applyFilters() {
    const store = getStore();
    const level = byId('alarmLevelFilter').value;
    const status = byId('alarmStatusFilter').value;
    const itemLevel = byId('alarmItemLevelFilter').value;
    const itemKey = byId('alarmItemFilter').value;

    filteredAlarms = store.alarms.filter(a => {
        if (state.deviceKey && alarmDeviceKeyOf(a, store).key !== state.deviceKey) return false;
        if (level && alarmLevelOf(a, store) !== level) return false;
        if (status && a.status !== status) return false;
        if (itemKey && !(a.items || []).some(i => i.key === itemKey)) return false;
        if (itemLevel && !alarmItemLevels(a, store).some(i => i.level === itemLevel)) return false;
        return true;
    });
    currentAlarmPage = 1;
    renderAlarms(paginateData(filteredAlarms, currentAlarmPage, alarmsPerPage));
    updateAlarmStats();
    updateScopeTip();
    renderAlarmPagination();
    refreshNavBadges();
}

// 顶部提示：当前设备范围与命中数量
function updateScopeTip() {
    const store = getStore();
    const tip = byId('alarmScopeTip');
    if (!tip) return;
    const group = alarmDeviceGroups(store).find(g => g.key === state.deviceKey);
    const label = state.deviceKey ? (group ? group.label : state.deviceKey) : '全部设备';
    tip.innerHTML = `当前设备：<b>${label}</b> · 命中 <b>${filteredAlarms.length}</b> / 全量 ${store.alarms.length} 条告警
        <span class="alarm-scope-hint">（左侧导航可按设备类型切换）</span>`;
}

// 渲染告警列表
function renderAlarms(alarms) {
    const tbody = byId('alarmsTableBody');
    if (!tbody) return;
    const store = getStore();
    tbody.innerHTML = '';
    if (!alarms.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#909399;">当前条件下没有告警</td></tr>';
        return;
    }

    alarms.forEach(alarm => {
        const levelKey = alarmLevelOf(alarm, store);
        const level = alarmLevelMap[levelKey] || alarmLevelMap.info;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="alarm-checkbox" data-id="${alarm.id}"></td>
            <td>${alarm.id}</td>
            <td>${alarm.time}<div style="font-size:11px;color:#909399">${timeAgo(alarm.ts)}</div></td>
            <td>${alarm.device}<div style="font-size:11px;color:#909399">${alarmDeviceKeyOf(alarm, store).label}</div></td>
            <td><span class="alarm-level ${level.class}">${level.name}</span></td>
            <td class="alarm-item-cell">${itemChips(alarm, store)}</td>
            <td>${alarm.content}</td>
            <td>
                <span class="status-tag ${alarm.status === '已处理' ? 'status-normal' : (alarm.status === '已忽略' ? 'status-warning' : 'status-danger')}">${alarm.status}</span>
                ${alarm.dispositionName ? `<div style="font-size:11px;color:#909399">${alarm.dispositionName}</div>` : ''}
                ${alarm.operator ? `<div style="font-size:11px;color:#909399">${alarm.operator}</div>` : ''}
            </td>
            <td>
                ${alarm.status === '未处理'
                ? `<button class="btn btn-small btn-primary" data-handle="${alarm.id}">处理</button>`
                : `<button class="btn btn-small btn-primary" data-view="${alarm.id}">查看</button>`}
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
    const moduleDiv = byId('alarm');
    if (!moduleDiv) return;
    const sections = moduleDiv.querySelectorAll('.table-section');
    const tableSection = sections[sections.length - 1];
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
    byId('almPrev').onclick = () => {
        if (currentAlarmPage > 1) { currentAlarmPage--; renderAlarms(paginateData(filteredAlarms, currentAlarmPage, alarmsPerPage)); renderAlarmPagination(); }
    };
    byId('almNext').onclick = () => {
        if (currentAlarmPage < totalPages) { currentAlarmPage++; renderAlarms(paginateData(filteredAlarms, currentAlarmPage, alarmsPerPage)); renderAlarmPagination(); }
    };
}

// 统计卡（全量口径 + 当前筛选命中提示）
function updateAlarmStats() {
    const store = getStore();
    const all = store.alarms;
    const set = (id, v) => { const el = byId(id); if (el) el.textContent = v; };
    set('totalAlarms', all.length);
    set('dangerAlarms', all.filter(a => alarmLevelOf(a, store) === 'danger').length);
    set('warningAlarms', all.filter(a => alarmLevelOf(a, store) === 'warning').length);
    set('infoAlarms', all.filter(a => alarmLevelOf(a, store) === 'info').length);
    set('unhandledAlarms', all.filter(a => a.status === '未处理').length);
    set('ignoredAlarms', all.filter(a => a.status === '已忽略').length);
    const totalEl = byId('totalAlarms');
    const hint = totalEl && totalEl.parentElement.querySelector('.stat-trend');
    if (hint) hint.textContent = `当前筛选范围内 ${filteredAlarms.length} 条`;
}

// 左侧导航：按设备类型筛选举措（数量取全量告警）
function renderSidebar() {
    const store = getStore();
    const groups = alarmDeviceGroups(store);
    const allCount = byId('alarmSideAllCount');
    if (allCount) allCount.textContent = store.alarms.length;

    const box = byId('alarmSideDevices');
    if (!box) return;
    const cats = ['核心设备', '安检门', '明眸设备', '探测设备', '系统与平台'];
    box.innerHTML = cats.map(cat => {
        const list = groups.filter(g => g.category === cat);
        if (!list.length) return '';
        return `<div class="device-category">
            <div class="category-title">${cat}</div>
            ${list.map(g => `<div class="side-item ${state.deviceKey === g.key ? 'active' : ''}" data-alarm-device="${g.key}">
                <span>${g.label}</span>
                <b class="side-count ${g.unhandled ? 'is-warn' : ''}" title="未处理 ${g.unhandled} 条 / 高危 ${g.high} 条">${g.count}</b>
            </div>`).join('')}
        </div>`;
    }).join('') || '<div class="side-tip">暂无可筛选的设备告警</div>';
    bindSidebar();
}

function bindSidebar() {
    const targets = document.querySelectorAll('.sidebar-panel[data-panel="alarm"] [data-alarm-device]');
    targets.forEach(el => {
        el.classList.toggle('active', (el.dataset.alarmDevice || '') === state.deviceKey);
        el.onclick = () => {
            state.deviceKey = el.dataset.alarmDevice || '';
            targets.forEach(t => t.classList.toggle('active', t === el));
            applyFilters();
        };
    });
}

// 物品识别排行：识别次数 / 查获次数 / 占比，可按等级切换
function renderItemRank() {
    const store = getStore();
    const stats = itemLevelStats(store);
    const cards = byId('itemRankCards');
    if (cards) {
        cards.innerHTML = ['high', 'mid', 'low'].map(lv => {
            const meta = itemLevelInfo(lv);
            return `<div class="item-rank-card is-${lv}">
                <b>${meta.tag}物品</b>
                <span class="item-rank-value">${stats.itemCount[lv]}<small>件</small></span>
                <small>${meta.desc}</small>
            </div>`;
        }).join('');
    }

    const rows = itemRanking(store).filter(r => !state.rankLevel || r.level === state.rankLevel);
    const top = rows.slice(0, 12);
    const max = top.length ? top[0].seen : 1;
    const body = byId('itemRankBody');
    if (!body) return;
    body.innerHTML = top.length ? top.map((r, i) => {
        const meta = itemLevelInfo(r.level);
        return `<tr>
            <td><span class="rank-no ${i < 3 ? 'is-top' : ''}">${i + 1}</span></td>
            <td><b>${r.name}</b>${r.seized ? `<span class="rank-seized">查获 ${r.seized}</span>` : ''}</td>
            <td>${r.category}</td>
            <td><span class="item-chip is-${r.level}">${meta.tag}</span></td>
            <td class="rank-cell">${r.seen}<div class="rank-bar"><i class="is-${r.level}" style="width:${Math.max(4, Math.round(r.seen / max * 100))}%"></i></div></td>
            <td>${r.seized || '—'}</td>
            <td>${r.share}%</td>
        </tr>`;
    }).join('') : '<tr><td colspan="7" style="text-align:center;color:#909399;">该等级暂无识别记录</td></tr>';
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
    const levelKey = alarmLevelOf(alarm, store);
    openModal({
        title: `处置告警 - ${alarm.id}`,
        width: 660,
        bodyHTML: `
            <div class="disp-summary">
                <div class="disp-summary-main">
                    <span class="alarm-level ${alarmLevelMap[levelKey].class}">${alarmLevelMap[levelKey].name}</span>
                    <b>${alarm.content}</b>
                </div>
                <div class="disp-summary-sub">${alarm.device} · ${alarmDeviceKeyOf(alarm, store).label} · ${alarm.time}${bag ? ` · 关联包裹 ${bag.id}` : ''}${dev ? ` · 匹配设备 ${dev.displayName}` : ''}</div>
                <div class="disp-item-list">${itemChips(alarm, store)}</div>
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
                renderSidebar();
                renderItemRank();
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

// 查看告警详情（联动包裹 / 交接单 / 物品等级配置）
function viewAlarmDetail(alarmId) {
    const store = getStore();
    const alarm = store.alarms.find(a => a.id === alarmId);
    if (!alarm) return;
    const bag = alarm.refId ? store.bags.find(b => b.id === alarm.refId) : null;
    const ho = bag ? store.handoffs.find(h => h.bagId === bag.id) : null;
    const levels = alarmItemLevels(alarm, store);
    const itemsText = levels.length
        ? levels.map(it => `${it.name}（${it.category}·${itemLevelInfo(it.level).tag}${it.qty > 1 ? `×${it.qty}` : ''}）`).join('；')
        : '';
    openModal({
        title: `告警详情 - ${alarm.id}`,
        width: 640,
        bodyHTML: `${kvTableHTML([
            ['告警时间', `${alarm.time}（${timeAgo(alarm.ts)}）`],
            ['告警设备', `${alarm.device}（${alarmDeviceKeyOf(alarm, store).label}）`],
            ['告警级别', `${alarmLevelMap[alarmLevelOf(alarm, store)].name}${alarm.maxItemLevel ? `（包内最高物品等级：${itemLevelInfo(alarm.maxItemLevel).tag}）` : ''}`],
            ['识别物品', itemsText],
            ['告警内容', alarm.content],
            ['补充说明', alarm.details],
            ['处理状态', `${alarm.status}${alarm.dispositionName ? `（${alarm.dispositionName}）` : ''}`],
            ['处理人 / 时间', alarm.operator ? `${alarm.operator} · ${alarm.handleTime}` : ''],
            ['处置结果', alarm.handleResult || ''],
            ['处置说明', alarm.handleNote || ''],
            ['关联包裹', bag ? `${bag.id}（${bag.ownerName}，${bag.disposition || bag.status}）` : ''],
            ['判图信息', bag && bag.judgeResult ? `${bag.judgeResult} / ${bag.judgeOperator || '-'} / AI 置信度 ${bag.ai ? bag.ai.confidence : '-'}%` : ''],
            ['关联交接单', ho ? `${ho.id}（${ho.status}）` : '']
        ])}<div class="disp-item-list">${itemChips(alarm, store)}</div>
        <p class="alarm-detail-tip">物品等级过低/过高都会直接影响本页告警级别，可在「配置管理 → 物品等级」中调整。</p>`,
        actions: [
            ho && ho.status !== '已完成' ? {
                label: '前往处置交接', className: 'btn-danger',
                onClick: (close) => { close(); document.querySelector('.nav-item[data-nav="handoff"]').click(); }
            } : null,
            {
                label: '调整物品等级', className: 'btn-secondary',
                onClick: (close) => {
                    close();
                    document.querySelector('.nav-item[data-nav="config"]').click();
                    setTimeout(() => {
                        const tab = document.querySelector('#config .tab-nav-item[data-tab="cfgItemLevels"]');
                        if (tab) tab.click();
                    }, 600);
                }
            }
        ].filter(Boolean)
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
                renderSidebar();
                renderItemRank();
            }
        }]
    });
}

// 设置全选功能
function setupSelectAll() {
    const selectAllCheckbox = byId('selectAllAlarms');
    if (!selectAllCheckbox) return;
    selectAllCheckbox.onchange = (e) => {
        document.querySelectorAll('.alarm-checkbox').forEach(cb => { cb.checked = e.target.checked; });
    };
}

// 批量处置：仅支持批量通过 / 批量忽略（复检、开包、维保需逐条确认）
function setupBatchHandle() {
    const batchHandleBtn = byId('batchHandleBtn');
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
                    renderSidebar();
                    renderItemRank();
                }
            }]
        });
    };
}

// 全局初始化函数
window.initAlarmModule = function () {
    state.deviceKey = '';
    state.rankLevel = '';
    const store = getStore();

    // 物品筛选下拉：取自物品目录，标注当前等级
    const itemSel = byId('alarmItemFilter');
    if (itemSel) {
        itemSel.innerHTML = '<option value="">全部物品</option>' + getItemCatalog(store)
            .map(i => `<option value="${i.key}">${i.name}（${itemLevelInfo(i.level).tag}）</option>`).join('');
        itemSel.onchange = applyFilters;
    }
    ['alarmLevelFilter', 'alarmStatusFilter', 'alarmItemLevelFilter'].forEach(id => {
        const el = byId(id);
        if (el) el.onchange = applyFilters;
    });

    byId('filterBtn').onclick = applyFilters;
    byId('resetBtn').onclick = () => {
        ['alarmLevelFilter', 'alarmStatusFilter', 'alarmItemLevelFilter'].forEach(id => { byId(id).value = ''; });
        if (itemSel) itemSel.value = '';
        state.deviceKey = '';
        state.rankLevel = '';
        document.querySelectorAll('#itemRankTabs .rank-tab').forEach(t => t.classList.toggle('active', !t.dataset.rankLevel));
        renderSidebar();
        renderItemRank();
        applyFilters();
    };

    document.querySelectorAll('#itemRankTabs .rank-tab').forEach(tab => {
        tab.onclick = () => {
            state.rankLevel = tab.dataset.rankLevel || '';
            document.querySelectorAll('#itemRankTabs .rank-tab').forEach(t => t.classList.toggle('active', t === tab));
            renderItemRank();
        };
    });

    renderSidebar();
    renderItemRank();
    setupSelectAll();
    setupBatchHandle();
    applyFilters();
};
