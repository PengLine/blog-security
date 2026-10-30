import { getStore, processEventById, processEventsByIds } from './db.js';
import { paginateData, toast, openModal, kvTableHTML, exportCSV, timeAgo, drawChart } from './utils.js';

const state = { page: 1, per: 20, filtered: [], selected: new Set() };

const LEVEL_NAME = {
    'status-danger': '危险',
    'status-warning': '警告',
    'status-normal': '正常',
    'status-processing': '处理中'
};

const LEVEL_CLS = {
    'status-danger': 'chip-danger',
    'status-warning': 'chip-warn',
    'status-normal': 'chip-pass',
    'status-processing': 'chip-info'
};

const PROCESS_CHIP = { '未处理': 'chip-warn', '处理中': 'chip-info', '已处理': 'chip-pass' };

function renderStats() {
    const events = getStore().events;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('evStatTotal', events.length);
    set('evStatUnhandled', events.filter(e => e.processStatus === '未处理').length);
    set('evStatProcessing', events.filter(e => e.processStatus === '处理中').length);
    const handled = events.filter(e => e.processStatus === '已处理').length;
    set('evStatHandled', handled);
    set('evStatDanger', events.filter(e => e.status === 'status-danger').length);
    set('evStatRate', `${events.length ? (handled / events.length * 100).toFixed(1) : '0.0'}%`);
}

function renderCharts() {
    const events = getStore().events;
    const colors = ['#409eff', '#e6a23c', '#67c23a', '#f56c6c', '#722ed1', '#909399'];

    const typeMap = {};
    events.forEach(e => { typeMap[e.type] = (typeMap[e.type] || 0) + 1; });
    const entries = Object.entries(typeMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    drawChart('evtTypeChart', '事件类型分布', entries.map(e => e[1]), entries.map(e => e[0]), colors);

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const series = hours.map(h => events.filter(e => new Date(e._ts).getHours() === h).length);
    drawChart('evtTrendChart', '24 小时事件量', series, hours.map(h => `${h}时`), ['#409eff']);
}

function fillTypeFilter() {
    const sel = document.getElementById('eventTypeFilter');
    if (!sel) return;
    const types = [...new Set(getStore().events.map(e => e.type))];
    const keep = sel.value;
    sel.innerHTML = '<option value="">全部</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
    if (keep && types.includes(keep)) sel.value = keep;
}

function applyFilters() {
    const store = getStore();
    const type = document.getElementById('eventTypeFilter').value;
    const level = document.getElementById('eventLevelFilter').value;
    const process = document.getElementById('eventProcessFilter').value;
    const keyword = document.getElementById('eventKeyword').value.trim();
    const todayOnly = document.getElementById('eventTodayOnly').checked;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);

    state.filtered = store.events.filter(e => {
        if (type && e.type !== type) return false;
        if (level && e.status !== level) return false;
        if (process && e.processStatus !== process) return false;
        if (todayOnly && e._ts < dayStart.getTime()) return false;
        if (keyword && !(e.id + e.device + e.details + (e.passengerId || '')).includes(keyword)) return false;
        return true;
    });
    state.selected = new Set([...state.selected].filter(id => state.filtered.some(e => e.id === id)));
    state.page = 1;

    const stat = document.getElementById('evtFilterStat');
    if (stat) stat.textContent = `匹配 ${state.filtered.length} 条 / 全部 ${store.events.length} 条`;
    renderEvents(paginateData(state.filtered, state.page, state.per));
    renderPagination();
    updateBatchLabel();
}

function relatedOf(evt, store) {
    const info = {};
    if (evt.passengerId) {
        const bags = store.bags.filter(b => b.owner === evt.passengerId).slice(0, 2);
        if (bags.length) info.bags = bags;
        const p = store.passengers.find(x => x.id === evt.passengerId);
        if (p) info.passenger = p;
    }
    const bagIdMatch = evt.details.match(/PKG-\d{8}-\d+/);
    if (bagIdMatch) {
        const bag = store.bags.find(b => b.id === bagIdMatch[0]);
        if (bag && !(info.bags || []).some(b => b.id === bag.id)) info.bags = [bag, ...(info.bags || [])];
        if (bag) {
            const ho = store.handoffs.find(h => h.bagId === bag.id);
            if (ho) info.handoff = ho;
            const alm = store.alarms.find(a => a.refId === bag.id);
            if (alm) info.alarm = alm;
        }
    }
    return info;
}

function renderEvents(rows) {
    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;
    const store = getStore();
    tbody.innerHTML = '';
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#909399;">没有符合条件的事件</td></tr>';
        return;
    }

    rows.forEach(event => {
        const related = relatedOf(event, store);
        const bag = (related.bags || [])[0];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" data-check="${event.id}" ${state.selected.has(event.id) ? 'checked' : ''}></td>
            <td>${event.id}</td>
            <td>${event.time}<div style="font-size:11px;color:#909399">${timeAgo(event._ts)}</div></td>
            <td>${event.device}</td>
            <td>${event.type}</td>
            <td><span class="chip ${LEVEL_CLS[event.status] || 'chip-info'}">${LEVEL_NAME[event.status] || '-'}</span></td>
            <td>${event.details}${bag ? `<div style="font-size:11px;color:#409eff;">关联包裹 ${bag.id}（${bag.judgeResult || '待判图'} / ${bag.disposition || '-'}）</div>` : ''}</td>
            <td><span class="chip ${PROCESS_CHIP[event.processStatus] || 'chip-info'}">${event.processStatus}</span></td>
            <td>${event.handler || '—'}${event.handleTime ? `<div style="font-size:11px;color:#909399">${event.handleTime}</div>` : ''}</td>
            <td>
                <button class="btn btn-small btn-primary" data-view="${event.id}">查看</button>
                ${event.processStatus !== '已处理' ? `<button class="btn btn-small btn-secondary" data-handle="${event.id}">处理</button>` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-check]').forEach(cb => {
        cb.onchange = () => {
            if (cb.checked) state.selected.add(cb.dataset.check);
            else state.selected.delete(cb.dataset.check);
            updateBatchLabel();
        };
    });
    tbody.querySelectorAll('[data-view]').forEach(btn => {
        btn.onclick = () => {
            const evt = getStore().events.find(e => e.id === btn.dataset.view);
            if (evt) showEventDetail(evt);
        };
    });
    tbody.querySelectorAll('[data-handle]').forEach(btn => {
        btn.onclick = () => openHandle(btn.dataset.handle);
    });

    const all = document.getElementById('evtCheckAll');
    if (all) all.checked = rows.length > 0 && rows.every(r => state.selected.has(r.id));
}

function updateBatchLabel() {
    const btn = document.getElementById('evtBatchBtn');
    if (btn) btn.textContent = state.selected.size ? `批量处理（${state.selected.size}）` : '批量处理';
}

function openHandle(eventId) {
    const store = getStore();
    const evt = store.events.find(e => e.id === eventId);
    if (!evt) return;
    openModal({
        title: `处理事件 - ${evt.id}`,
        width: 560,
        bodyHTML: `
            <div class="form-grid">
                <label>事件</label><input class="form-control" value="${evt.type}：${evt.details}" disabled>
                <label>处理人</label><input class="form-control" value="${store.currentUser.name}（${store.currentUser.role}）" disabled>
                <label>处理意见</label><textarea class="form-control" id="evtHandleNote" rows="3" placeholder="填写处理措施，如：已引导复测 / 已通知设备厂商"></textarea>
            </div>`,
        actions: [{
            label: '确认处理',
            className: 'btn-success',
            onClick: (close, mask) => {
                const note = mask.querySelector('#evtHandleNote').value.trim();
                processEventById(evt.id, store.currentUser.name, note);
                toast(`事件 ${evt.id} 已处理`, 'success');
                close();
                refresh();
            }
        }]
    });
}

// 关联包裹 / 交接 / 告警 / 复检的完整详情
function showEventDetail(evt) {
    const store = getStore();
    const related = relatedOf(evt, store);
    const bag = (related.bags || [])[0];
    const rows = [
        ['事件ID', evt.id],
        ['事件时间', `${evt.time}（${timeAgo(evt._ts)}）`],
        ['触发设备', evt.device],
        ['事件类型 / 等级', `${evt.type} / ${LEVEL_NAME[evt.status] || '-'}`],
        ['处理状态', `${evt.processStatus}${evt.handler ? `（${evt.handler} 于 ${evt.handleTime || ''}）` : ''}`],
        ['处理意见', evt.handleNote || (evt.processStatus === '已处理' ? '现场处置完毕' : '')],
        ['事件详情', evt.details],
        related.passenger ? ['关联旅客', `${related.passenger.name}（${related.passenger.id}）· ${related.passenger.department}`] : null,
        bag ? ['关联包裹', `${bag.id}（${bag.channelName} / ${bag.weightKg}kg）`] : null,
        bag ? ['判图处置', `${bag.judgeResult || '待判图'} / ${bag.disposition || '-'}${bag.judgeOperator ? `（${bag.judgeOperator}）` : ''}`] : null,
        bag && bag.recheck ? ['复检状态', `${bag.recheck.status}${bag.recheck.result ? ` / ${bag.recheck.result}` : ''}${bag.recheck.note ? `（${bag.recheck.note}）` : ''}`] : null,
        bag && bag.seized ? ['查扣明细', `${bag.seized.typeName}·${bag.seized.itemName} × ${bag.seized.qty}${bag.seized.unit}`] : null,
        related.handoff ? ['交接单', `${related.handoff.id}（${related.handoff.status}${related.handoff.police ? ` / ${related.handoff.police}` : ''}）`] : null,
        related.alarm ? ['关联告警', `${related.alarm.id}（${related.alarm.type} / ${related.alarm.status}）`] : null
    ];
    openModal({
        title: `事件详情 - ${evt.id}`,
        width: 680,
        bodyHTML: kvTableHTML(rows)
    });
}

function openBatch() {
    const ids = [...state.selected];
    if (!ids.length) { toast('请先勾选需要处理的事件', 'warning'); return; }
    const store = getStore();
    const pending = ids.filter(id => {
        const e = store.events.find(x => x.id === id);
        return e && e.processStatus !== '已处理';
    });
    openModal({
        title: `批量处理 ${ids.length} 条事件`,
        width: 600,
        bodyHTML: `
            ${kvTableHTML([
                ['已勾选', `${ids.length} 条（其中待处理 ${pending.length} 条）`],
                ['处理人', `${store.currentUser.name}（${store.currentUser.role}）`],
                ['处理范围', ids.slice(0, 6).join('、') + (ids.length > 6 ? ` 等 ${ids.length} 条` : '')]
            ])}
            <div class="form-grid" style="margin-top:12px;">
                <label>处理意见</label>
                <textarea class="form-control" id="evtBatchNote" rows="3" placeholder="统一填写处理措施，如：已现场核实并引导复测"></textarea>
            </div>
            <p style="margin-top:8px;font-size:12px;color:#909399;">已处理的事件将自动跳过，批量操作只产生一条审计留痕。</p>`,
        actions: [{
            label: '确认批量处理',
            className: 'btn-success',
            onClick: (close, mask) => {
                const note = mask.querySelector('#evtBatchNote').value.trim();
                const ok = processEventsByIds(ids, store.currentUser.name, note);
                toast(ok ? `已批量处理 ${ok} 条事件` : '所选事件均已处理', ok ? 'success' : 'info');
                state.selected.clear();
                close();
                refresh();
            }
        }]
    });
}

function renderPagination() {
    const moduleDiv = document.getElementById('events');
    if (!moduleDiv) return;
    const tableSection = moduleDiv.querySelector('.table-section');
    if (!tableSection) return;

    let box = tableSection.querySelector('.pagination-page');
    if (!box) {
        box = document.createElement('div');
        box.className = 'pagination-page';
        tableSection.appendChild(box);
    }
    const totalPages = Math.ceil(state.filtered.length / state.per);
    if (totalPages <= 1) { box.innerHTML = ''; return; }

    box.innerHTML = `
        <button class="btn btn-secondary" ${state.page <= 1 ? 'disabled' : ''} id="evtPrev">上一页</button>
        <span class="page-info">第 ${state.page} 页，共 ${totalPages} 页（${state.filtered.length} 条）</span>
        <button class="btn btn-secondary" ${state.page >= totalPages ? 'disabled' : ''} id="evtNext">下一页</button>
    `;
    document.getElementById('evtPrev').onclick = () => {
        if (state.page > 1) {
            state.page--;
            renderEvents(paginateData(state.filtered, state.page, state.per));
            renderPagination();
        }
    };
    document.getElementById('evtNext').onclick = () => {
        if (state.page < totalPages) {
            state.page++;
            renderEvents(paginateData(state.filtered, state.page, state.per));
            renderPagination();
        }
    };
}

function exportEvents() {
    const rows = state.selected.size
        ? getStore().events.filter(e => state.selected.has(e.id))
        : state.filtered;
    exportCSV(`事件台账_${new Date().toISOString().slice(0, 10)}.csv`,
        ['事件ID', '时间', '设备', '类型', '等级', '详情', '处理状态', '处理人', '处理时间', '处理意见'],
        rows.map(e => [e.id, e.time, e.device, e.type, LEVEL_NAME[e.status] || '', e.details,
            e.processStatus, e.handler || '', e.handleTime || '', e.handleNote || '']));
}

function refresh() {
    renderStats();
    fillTypeFilter();
    renderCharts();
    applyFilters();
}

window.initEventsModule = function () {
    ['eventTypeFilter', 'eventLevelFilter', 'eventProcessFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onchange = applyFilters;
    });
    const kw = document.getElementById('eventKeyword');
    if (kw) kw.onkeydown = e => { if (e.key === 'Enter') applyFilters(); };
    const today = document.getElementById('eventTodayOnly');
    if (today) today.onchange = applyFilters;
    document.getElementById('eventSearchBtn').onclick = applyFilters;
    document.getElementById('eventResetBtn').onclick = () => {
        document.getElementById('eventTypeFilter').value = '';
        document.getElementById('eventLevelFilter').value = '';
        document.getElementById('eventProcessFilter').value = '';
        document.getElementById('eventKeyword').value = '';
        document.getElementById('eventTodayOnly').checked = false;
        state.selected.clear();
        applyFilters();
    };

    const checkAll = document.getElementById('evtCheckAll');
    if (checkAll) checkAll.onchange = () => {
        const pageRows = paginateData(state.filtered, state.page, state.per);
        pageRows.forEach(e => checkAll.checked ? state.selected.add(e.id) : state.selected.delete(e.id));
        renderEvents(pageRows);
        updateBatchLabel();
    };

    document.getElementById('evtBatchBtn').onclick = openBatch;
    document.getElementById('evtSelectPendingBtn').onclick = () => {
        const pending = state.filtered.filter(e => e.processStatus !== '已处理');
        if (!pending.length) { toast('当前筛选结果中没有待处理事件', 'info'); return; }
        pending.forEach(e => state.selected.add(e.id));
        renderEvents(paginateData(state.filtered, state.page, state.per));
        updateBatchLabel();
        toast(`已勾选 ${pending.length} 条待处理事件`, 'success');
    };
    document.getElementById('evtExportBtn').onclick = exportEvents;

    refresh();
};
