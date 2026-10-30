import { getStore, completeHandoff, CONTRABAND_TYPES } from './db.js';
import { toast, openModal, kvTableHTML, exportCSV, paginateData, timeAgo } from './utils.js';

let currentPage = 1;
const perPage = 15;
let filtered = [];

// 应用筛选条件
function applyFilters() {
    const store = getStore();
    const status = document.getElementById('hoStatusFilter').value;
    const category = document.getElementById('hoCategoryFilter').value;
    const keyword = document.getElementById('hoKeyword').value.trim();

    filtered = store.handoffs.filter(h => {
        if (status && h.status !== status) return false;
        if (category && h.category !== category) return false;
        if (keyword && !(h.id + h.bagId + h.passengerName).includes(keyword)) return false;
        return true;
    });
    currentPage = 1;
    renderTable();
}

// 渲染统计卡
function renderStats() {
    const store = getStore();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('hoStatTotal', store.handoffs.length);
    set('hoStatPending', store.handoffs.filter(h => h.status === '待移交').length);
    set('hoStatMoving', store.handoffs.filter(h => h.status === '移交中').length);
    set('hoStatDone', store.handoffs.filter(h => h.status === '已完成').length);
}

function statusTag(status) {
    const cls = status === '已完成' ? 'status-normal' : status === '移交中' ? 'status-processing' : 'status-warning';
    return `<span class="status-tag ${cls}">${status}</span>`;
}

// 渲染台账表格
function renderTable() {
    const tbody = document.getElementById('hoTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    paginateData(filtered, currentPage, perPage).forEach(h => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${h.id}</td>
            <td>${h.time}<div style="font-size:11px;color:#909399">${timeAgo(h.ts)}</div></td>
            <td>${h.passengerName}</td>
            <td>
                <span class="chip ${h.level === 'severe' ? 'chip-danger' : 'chip-warn'}">${h.category}</span>
                ${h.typeName.split('·')[1] || h.typeName}
            </td>
            <td>${h.qty} ${h.unit}</td>
            <td>${h.foundBy}（${h.foundByRole}）</td>
            <td>${h.toPost}</td>
            <td>${statusTag(h.status)}</td>
            <td>
                <button class="btn btn-primary" data-detail="${h.id}">详情</button>
                ${h.status === '待移交' ? `<button class="btn btn-warning" style="background-color:#e6a23c;color:#fff;" data-start="${h.id}">开始移交</button>` : ''}
                ${h.status === '移交中' ? `<button class="btn btn-success" data-complete="${h.id}">完成交接</button>` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });

    const totalPages = Math.ceil(filtered.length / perPage);
    const pag = document.getElementById('hoPagination');
    pag.innerHTML = totalPages <= 1 ? '' : `
        <button class="btn btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} id="hoPrev">上一页</button>
        <span class="page-info">第 ${currentPage} 页，共 ${totalPages} 页（${filtered.length} 条）</span>
        <button class="btn btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} id="hoNext">下一页</button>
    `;
    if (totalPages > 1) {
        document.getElementById('hoPrev').onclick = () => { currentPage--; renderTable(); };
        document.getElementById('hoNext').onclick = () => { currentPage++; renderTable(); };
    }

    tbody.querySelectorAll('[data-detail]').forEach(btn => btn.onclick = () => showDetail(btn.dataset.detail));
    tbody.querySelectorAll('[data-start]').forEach(btn => btn.onclick = () => {
        const h = getStore().handoffs.find(x => x.id === btn.dataset.start);
        if (h) { h.status = '移交中'; toast(`${h.id} 已转入移交流程，请押送至 ${h.toPost}`, 'info'); refresh(); }
    });
    tbody.querySelectorAll('[data-complete]').forEach(btn => btn.onclick = () => showCompleteForm(btn.dataset.complete));
}

// 交接单详情（模拟纸质交接回执）
function showDetail(id) {
    const store = getStore();
    const h = store.handoffs.find(x => x.id === id);
    if (!h) return;
    const bag = store.bags.find(b => b.id === h.bagId);
    openModal({
        title: `查扣物品交接单 - ${h.id}`,
        width: 620,
        bodyHTML: `
            <div class="ho-card">
                <div class="ho-title">安全检查物品交接登记单</div>
                ${kvTableHTML([
                    ['交接单号', h.id],
                    ['仓储编号', h.storageNo],
                    ['关联包裹', `${h.bagId}${bag ? `（${bag.weightKg}kg / ${bag.machineName}）` : ''}`],
                    ['当事人', `${h.passengerName}（${h.passengerId}）`],
                    ['查获物品', h.typeName],
                    ['物品类别', `${h.category}（${h.level === 'severe' ? '<span class="level-severe">禁止携带</span>' : '<span class="level-restricted">限制携带</span>'}）`],
                    ['数量', `${h.qty} ${h.unit}`],
                    ['查获方式', `${h.foundWay}（查获人：${h.foundBy} / ${h.foundByRole}）`],
                    ['查获时间', h.time],
                    ['接收岗位', h.toPost],
                    ['移交民警', h.police || '（待指定）'],
                    ['完成时间', h.finishTime || '（未完成）'],
                    ['备注', h.note]
                ])}
                <div class="ho-sign">
                    <span>移交人签字：${h.foundBy}</span>
                    <span>接收人签字：${h.status === '已完成' ? h.police : '____________'}</span>
                </div>
            </div>`
    });
}

// 完成交接（选择民警并确认）
function showCompleteForm(id) {
    const store = getStore();
    const h = store.handoffs.find(x => x.id === id);
    if (!h) return;
    const policeOptions = ['民警·郑志强 (JWT356)', '民警·沙澜 (JWT361)', '民警·崔保国 (JWT344)']
        .map(p => `<option value="${p}">${p}</option>`).join('');
    openModal({
        title: `完成交接确认 - ${h.id}`,
        width: 520,
        bodyHTML: `
            <div class="form-grid">
                <label>交接物品</label><input class="form-control" value="${h.typeName} × ${h.qty}${h.unit}" disabled>
                <label>移交民警</label><select class="form-control" id="hoPoliceSelect">${policeOptions}</select>
                <label>见证人</label><input class="form-control" id="hoWitness" value="${store.currentUser.name}" placeholder="请输入见证人">
            </div>
            <p style="margin-top:12px;font-size:12px;color:#909399;">确认后：交接单置为「已完成」，关联告警自动闭环，事件中心记录同步更新处理状态。</p>`,
        actions: [{
            label: '确认交接', className: 'btn-success',
            onClick: (close, mask) => {
                const police = mask.querySelector('#hoPoliceSelect').value;
                completeHandoff(h.id, police);
                toast(`${h.id} 已与 ${police} 完成交接，关联告警已闭环`, 'success');
                close();
                refresh();
            }
        }]
    });
}

function refresh() {
    applyFilters();
    renderStats();
}

// 全局初始化函数
window.initHandoffModule = function() {
    const store = getStore();

    // 类别下拉（来自违禁品字典 + 台账实际类别）
    const catSel = document.getElementById('hoCategoryFilter');
    if (catSel && catSel.options.length <= 1) {
        const cats = [...new Set(store.handoffs.map(h => h.category))];
        catSel.innerHTML = '<option value="">全部</option>' +
            CONTRABAND_TYPES.filter(c => cats.includes(c.name)).map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }

    document.getElementById('hoStatusFilter').onchange = applyFilters;
    document.getElementById('hoCategoryFilter').onchange = applyFilters;
    document.getElementById('hoKeyword').onkeydown = (e) => { if (e.key === 'Enter') applyFilters(); };
    document.getElementById('hoSearchBtn').onclick = applyFilters;
    document.getElementById('hoExportBtn').onclick = () => {
        exportCSV(`查扣交接台账_${new Date().toISOString().slice(0, 10)}.csv`,
            ['交接单号', '查获时间', '旅客', '物品', '类别', '数量', '单位', '查获人', '接收岗位', '移交民警', '状态', '关联包裹'],
            filtered.map(h => [h.id, h.time, h.passengerName, h.typeName, h.category, h.qty, h.unit, h.foundBy, h.toPost, h.police || '-', h.status, h.bagId]));
    };

    refresh();
};
