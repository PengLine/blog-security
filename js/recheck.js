import { getStore, recheckQueue, startRecheck, completeRecheck, onDutyEmployees, currentShiftDef } from './db.js';
import { toast, openModal, kvTableHTML, timeAgo, refreshNavBadges } from './utils.js';

let selectedId = null;

function operatorName() {
    const sel = document.getElementById('recheckOperatorSelect');
    return sel && sel.value ? sel.value : '复检员';
}

function initOperatorSelect() {
    const sel = document.getElementById('recheckOperatorSelect');
    if (!sel) return;
    if (sel.options.length) return; // 已初始化，保留当前选择
    const store = getStore();
    let recheckers = onDutyEmployees('复检员');
    if (!recheckers.length) recheckers = store.employees.filter(e => e.role === '复检员');
    const curKey = currentShiftDef().key;
    recheckers.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.name;
        opt.textContent = `${e.name}（${e.team}·${curKey}当班）`;
        sel.appendChild(opt);
    });
}

function renderStats(store) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const all = store.bags.filter(b => b.recheck);
    set('rcStatPending', all.filter(b => b.recheck.status === '待复检').length);
    set('rcStatChecking', all.filter(b => b.recheck.status === '检查中').length);
    set('rcStatPassed', all.filter(b => b.recheck.status === '已完成' && b.recheck.result === '放行').length);
    set('rcStatSeized', all.filter(b => b.recheck.status === '已完成' && b.recheck.result === '查扣').length);
}

function renderQueue(store) {
    const list = document.getElementById('recheckList');
    const stat = document.getElementById('recheckQueueStat');
    if (!list) return;
    const queue = recheckQueue(store);
    if (stat) stat.textContent = `待复检队列 ${queue.length} 件`;

    if (!queue.length) {
        list.innerHTML = '<div style="color:#909399;font-size:13px;padding:16px;">暂无待复检包裹，判图中标记为「可疑」的包裹会自动进入本队列</div>';
        return;
    }

    list.innerHTML = '';
    queue.forEach(bag => {
        const el = document.createElement('div');
        el.className = 'judge-item' + (bag.id === selectedId ? ' active' : '');
        el.dataset.id = bag.id;
        const statusTag = bag.recheck.status === '检查中'
            ? '<span class="status-tag status-processing">检查中</span>'
            : '<span class="status-tag status-warning">待复检</span>';
        const waitMin = Math.max(1, Math.floor((Date.now() - (bag.judgeTs || bag.scanTs)) / 60000));
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="judge-item-id">${bag.id}</span>${statusTag}
            </div>
            <div style="font-size:12px;color:#909399;margin-top:4px;">
                ${bag.ownerName} · ${bag.channelName || ''} · AI：${bag.ai ? bag.ai.label : '无标记'}
            </div>
            <div style="font-size:11px;color:#c0c4cc;margin-top:2px;">判图后已等待 ${waitMin} 分钟</div>
        `;
        el.onclick = () => { selectedId = bag.id; renderQueue(store); renderDetail(store); };
        list.appendChild(el);
    });
}

function renderDetail(store) {
    const box = document.getElementById('recheckDetail');
    if (!box) return;
    const bag = store.bags.find(b => b.id === selectedId);
    if (!bag || !bag.recheck) {
        box.style.color = '#909399';
        box.style.padding = '24px';
        box.style.fontSize = '13px';
        box.innerHTML = '从右侧队列选择一件「可疑」包裹，核对 AI 标记与判图结论后开始开包检查。';
        return;
    }
    box.style.padding = '0';
    const rc = bag.recheck;
    const waitMin = Math.max(1, Math.floor((Date.now() - (bag.judgeTs || bag.scanTs)) / 60000));
    const statusText = rc.status === '已完成' ? `已完成（${rc.result}）` : rc.status;
    box.innerHTML = kvTableHTML([
        ['包裹编号', bag.id], ['旅客', `${bag.ownerName}（${bag.owner}）`],
        ['过检通道', `${bag.machineName || ''} · ${bag.channelName || ''}`],
        ['过检时间', `${bag.scanTime}（${timeAgo(bag.scanTs)}）`],
        ['AI 预判', `${bag.ai ? bag.ai.label : '无标记'}${bag.ai && bag.ai.confidence ? ` · 置信度 ${bag.ai.confidence}%` : ''}`],
        ['判图结论', `${bag.judgeResult || '-'}（判图员：${bag.judgeBy || '-'}）`],
        ['判图后等待', `${waitMin} 分钟`],
        ['复检状态', statusText], ['复检人', rc.by || '-']
    ]) + (bag.ai && bag.ai.type ? `<div style="margin-top:10px;padding:10px 12px;background:#fdf6ec;border-left:3px solid #e6a23c;font-size:12px;color:#b88230;">
        AI 关注品类：<b>${bag.ai.type}</b>，开包时请重点核对同类物品。</div>` : '');
}

function setButtonsEnabled(store) {
    const bag = store.bags.find(b => b.id === selectedId);
    const active = !!(bag && bag.recheck && bag.recheck.status !== '已完成');
    const startBtn = document.getElementById('btnRcStart');
    const passBtn = document.getElementById('btnRcPass');
    const seizeBtn = document.getElementById('btnRcSeize');
    if (startBtn) startBtn.disabled = !active || bag.recheck.status === '检查中';
    if (passBtn) passBtn.disabled = !active || bag.recheck.status !== '检查中';
    if (seizeBtn) seizeBtn.disabled = !active || bag.recheck.status !== '检查中';
}

function renderHistory(store) {
    const tbody = document.getElementById('recheckHistoryBody');
    if (!tbody) return;
    const rows = store.bags
        .filter(b => b.recheck && b.recheck.status === '已完成')
        .sort((a, b) => (b.recheck.finishTs || 0) - (a.recheck.finishTs || 0))
        .slice(0, 20);
    tbody.innerHTML = rows.length ? rows.map(b => `
        <tr>
            <td>${new Date(b.recheck.finishTs).toLocaleString()}</td>
            <td>${b.id}</td>
            <td>${b.ownerName}</td>
            <td>${b.ai ? b.ai.label : '-'}</td>
            <td>${b.recheck.note || '-'}</td>
            <td><span class="status-tag ${b.recheck.result === '查扣' ? 'status-danger' : 'status-normal'}">${b.recheck.result === '查扣' ? '开包查扣' : '复检放行'}</span></td>
            <td>${b.recheck.by || '-'}</td>
        </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center;color:#909399;">暂无复检记录</td></tr>';
}

function refresh() {
    const store = getStore();
    if (selectedId && !store.bags.some(b => b.id === selectedId)) selectedId = null;
    renderStats(store);
    renderQueue(store);
    renderDetail(store);
    setButtonsEnabled(store);
    renderHistory(store);
    refreshNavBadges();
}

function bindActions() {
    const startBtn = document.getElementById('btnRcStart');
    if (!startBtn) return;
    startBtn.onclick = () => {
        if (!selectedId) { toast('请先从队列选择包裹', 'warning'); return; }
        const bag = startRecheck(selectedId, operatorName());
        if (!bag) { toast('该包裹复检状态已变更，请刷新队列', 'warning'); return; }
        toast(`${bag.id} 已进入开包检查，请通知旅客到场开箱`, 'info');
        refresh();
    };

    document.getElementById('btnRcPass').onclick = () => {
        const store = getStore();
        const bag = store.bags.find(b => b.id === selectedId);
        if (!bag) { toast('请先选择包裹', 'warning'); return; }
        openModal({
            title: `复检放行 - ${bag.id}`, width: 520,
            bodyHTML: `
                <div class="form-grid">
                    <label>开包检查情况</label>
                    <textarea class="form-control" id="rcPassNote" rows="3">开包检查未见异常，物品与 AI 标记不符，复测后放行</textarea>
                </div>
                <p style="margin-top:10px;font-size:12px;color:#909399;">确认后该包裹处置结论变更为「复检放行」，同步写入通行台账与事件中心。</p>`,
            actions: [{
                label: '确认放行', className: 'btn-success',
                onClick: (close) => {
                    const note = document.getElementById('rcPassNote').value.trim();
                    completeRecheck(bag.id, true, note, operatorName());
                    toast(`${bag.id} 复检放行，旅客可正常通行`, 'success');
                    selectedId = null; close(); refresh();
                }
            }]
        });
    };

    document.getElementById('btnRcSeize').onclick = () => {
        const store = getStore();
        const bag = store.bags.find(b => b.id === selectedId);
        if (!bag) { toast('请先选择包裹', 'warning'); return; }
        openModal({
            title: `开包查扣 - ${bag.id}`, width: 540,
            bodyHTML: `
                <div class="form-grid">
                    <label>查出物品</label>
                    <input class="form-control" value="${bag.ai ? bag.ai.type : '疑似违禁品'}（${bag.seized ? bag.seized.itemName : '现场确认'}）" disabled>
                    <label>检查记录</label>
                    <textarea class="form-control" id="rcSeizeNote" rows="3">开包检查确认违禁，已当场控制并转查扣登记</textarea>
                </div>
                <p style="margin-top:10px;font-size:12px;color:#f56c6c;">将自动生成查扣登记单与危险级告警，并通知值班民警到场合规交接。</p>`,
            actions: [{
                label: '确认查扣', className: 'btn-danger',
                onClick: (close) => {
                    const note = document.getElementById('rcSeizeNote').value.trim();
                    const result = completeRecheck(bag.id, false, note, operatorName());
                    close();
                    selectedId = null;
                    refresh();
                    if (result) {
                        const ho = getStore().handoffs.find(h => h.bagId === result.id);
                        openModal({
                            title: '查扣登记已生成', width: 520,
                            bodyHTML: kvTableHTML([
                                ['包裹', result.id], ['处置结论', '开包查扣'],
                                ['查扣登记', ho ? ho.id : '-'], ['暂存柜位', ho ? ho.storageNo : '-'],
                                ['交接状态', ho ? ho.status : '-']
                            ]),
                            actions: [{
                                label: '前往处置交接',
                                onClick: (c) => {
                                    c();
                                    const nav = document.querySelector('.nav-item[data-nav="handoff"]');
                                    if (nav) nav.click();
                                }
                            }]
                        });
                    }
                }
            }]
        });
    };

    document.getElementById('btnRcNext').onclick = () => {
        const queue = recheckQueue(getStore());
        const current = queue.findIndex(b => b.id === selectedId);
        const next = queue[current + 1] || queue[0];
        if (!next) { toast('队列已处理完毕', 'info'); return; }
        selectedId = next.id;
        refresh();
    };

    document.getElementById('recheckRefreshBtn').onclick = () => {
        refresh();
        toast('复检队列已刷新', 'info');
    };
}

window.initRecheckModule = function() {
    initOperatorSelect();
    bindActions();
    refresh();
};
