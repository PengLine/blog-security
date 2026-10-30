import { getStore, createRepairOrder, dispatchWorkorder, finishRepair, acceptWorkorder, fmtDateTime, currentShiftDef } from './db.js';
import { toast, openModal, kvTableHTML, exportCSV, paginateData, timeAgo, refreshNavBadges } from './utils.js';

let currentPage = 1;
const perPage = 15;
let filtered = [];

const STATUS_TAG = {
    '待派工': 'status-danger',
    '维修中': 'status-warning',
    '待验收': 'status-processing',
    '已完成': 'status-normal'
};

function durationText(wo) {
    const end = wo.status === '已完成' ? wo.acceptTs : (wo.status === '待验收' ? wo.finishTs : Date.now());
    const min = Math.max(1, Math.round((end - wo.ts) / 60000));
    const txt = min >= 60 ? `${Math.floor(min / 60)}小时${min % 60}分` : `${min}分钟`;
    const over = min > wo.slaMin && wo.status !== '已完成';
    return wo.status === '已完成' ? txt : `${txt} / 时限${wo.slaMin}分钟${over ? ' <span style="color:#f56c6c;">已超时</span>' : ''}`;
}

function applyFilters() {
    const store = getStore();
    const status = document.getElementById('woStatusFilter').value;
    const level = document.getElementById('woLevelFilter').value;
    const keyword = document.getElementById('woKeyword').value.trim();
    filtered = store.workorders.filter(w => {
        if (status && w.status !== status) return false;
        if (level && w.level !== level) return false;
        if (keyword && !(w.id + w.deviceName + w.channel + w.faultType).includes(keyword)) return false;
        return true;
    });
    currentPage = 1;
    renderTable();
}

function renderStats() {
    const store = getStore();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('woStatPending', store.workorders.filter(w => w.status === '待派工').length);
    set('woStatDoing', store.workorders.filter(w => w.status === '维修中').length);
    set('woStatAccept', store.workorders.filter(w => w.status === '待验收').length);
    set('woStatDone', store.workorders.filter(w => w.status === '已完成').length);
}

function renderTable() {
    const tbody = document.getElementById('woTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    paginateData(filtered, currentPage, perPage).forEach(w => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${w.id}</td>
            <td>${w.deviceName}<div style="font-size:11px;color:#909399">${w.channel} · ${w.category}</div></td>
            <td>${w.faultType}</td>
            <td><span class="chip ${w.level === '紧急' ? 'chip-danger' : 'chip-info'}">${w.level}</span></td>
            <td><span class="status-tag ${STATUS_TAG[w.status]}">${w.status}</span></td>
            <td>${w.time}<div style="font-size:11px;color:#909399">${timeAgo(w.ts)}</div></td>
            <td>${w.technician || '-'}</td>
            <td style="font-size:12px;">${durationText(w)}</td>
            <td>
                <button class="btn btn-primary" data-detail="${w.id}">详情</button>
                ${w.status === '待派工' ? `<button class="btn btn-warning" style="background-color:#e6a23c;color:#fff;" data-dispatch="${w.id}">派工</button>` : ''}
                ${w.status === '维修中' ? `<button class="btn btn-success" data-finish="${w.id}">完工</button>` : ''}
                ${w.status === '待验收' ? `<button class="btn btn-secondary" data-accept="${w.id}">验收</button>` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });

    const totalPages = Math.ceil(filtered.length / perPage);
    const pag = document.getElementById('woPagination');
    pag.innerHTML = totalPages <= 1 ? '' : `
        <button class="btn btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} id="woPrev">上一页</button>
        <span class="page-info">第 ${currentPage} 页，共 ${totalPages} 页（${filtered.length} 条）</span>
        <button class="btn btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} id="woNext">下一页</button>
    `;
    if (totalPages > 1) {
        document.getElementById('woPrev').onclick = () => { currentPage--; renderTable(); };
        document.getElementById('woNext').onclick = () => { currentPage++; renderTable(); };
    }

    tbody.querySelectorAll('[data-detail]').forEach(btn => btn.onclick = () => showDetail(btn.dataset.detail));
    tbody.querySelectorAll('[data-dispatch]').forEach(btn => btn.onclick = () => showDispatchForm(btn.dataset.dispatch));
    tbody.querySelectorAll('[data-finish]').forEach(btn => btn.onclick = () => showFinishForm(btn.dataset.finish));
    tbody.querySelectorAll('[data-accept]').forEach(btn => btn.onclick = () => showAcceptForm(btn.dataset.accept));
}

// 工单详情：状态时间线 + 关键信息
function showDetail(id) {
    const store = getStore();
    const w = store.workorders.find(x => x.id === id);
    if (!w) return;
    const steps = [
        { title: `报修登记：${w.description}`, ts: w.ts, cls: 'tl-done' },
        w.dispatchTs ? { title: `派工给维修工程师·${w.technician}（要求 ${w.slaMin} 分钟内响应）`, ts: w.dispatchTs, cls: 'tl-done' } : { title: '等待派工', ts: 0, cls: w.status === '待派工' ? 'tl-current' : '' },
        w.finishTs ? { title: `维修完工：${w.repairNote}（更换：${w.parts}）`, ts: w.finishTs, cls: 'tl-done' } : { title: w.status === '维修中' ? '维修中…' : '等待派工后维修', ts: 0, cls: w.status === '维修中' ? 'tl-current' : '' },
        w.acceptTs ? { title: `${w.acceptor} 验收通过：${w.acceptNote}，设备已恢复在线，关联告警闭环`, ts: w.acceptTs, cls: 'tl-done' }
            : (w.acceptNote && !w.acceptTs ? { title: `验收退回：${w.acceptNote}`, ts: Date.now(), cls: 'tl-bad' }
                : { title: w.status === '待验收' ? '等待队长验收' : '等待验收', ts: 0, cls: w.status === '待验收' ? 'tl-current' : '' })
    ];
    openModal({
        title: `维修工单 - ${w.id}`,
        width: 640,
        bodyHTML: `
            ${kvTableHTML([
                ['设备', `${w.deviceName}（${w.deviceId}）`],
                ['位置', `${w.channel} · ${w.category}`],
                ['型号/IP', `${w.model} / ${w.ip}`],
                ['故障类型', w.faultType],
                ['级别', `<span class="chip ${w.level === '紧急' ? 'chip-danger' : 'chip-info'}">${w.level}</span>`],
                ['当前状态', `<span class="status-tag ${STATUS_TAG[w.status]}">${w.status}</span>`],
                ['维修工程师', w.technician || '（待派工）'],
                ['耗时', durationText(w)]
            ])}
            <div class="sub-title">流转记录</div>
            <div class="timeline">${steps.map(s => `
                <div class="tl-item ${s.cls}">
                    <div class="t-title">${s.title}</div>
                    <div class="t-time">${s.ts ? fmtDateTime(s.ts) : '—'}</div>
                </div>`).join('')}
            </div>`
    });
}

// 派工（维修工程师下拉，当班优先）
function showDispatchForm(id) {
    const store = getStore();
    const w = store.workorders.find(x => x.id === id);
    if (!w) return;
    const techs = store.employees.filter(e => e.role === '维修工程师');
    const dutyShift = store.shifts.find(s => s.key === currentShiftDef().key) || store.shifts[0];
    openModal({
        title: `工单派工 - ${w.id}`,
        width: 520,
        bodyHTML: `
            <div class="form-grid">
                <label>故障设备</label><input class="form-control" value="${w.deviceName}（${w.faultType}）" disabled>
                <label>维修工程师</label>
                <select class="form-control" id="woTechSelect">
                    ${techs.map(t => `<option value="${t.name}">${t.name}（${t.team}·${dutyShift.members.includes(t.id) ? '当班' : '备勤'}）</option>`).join('')}
                </select>
            </div>
            <p style="margin-top:12px;font-size:12px;color:#909399;">派工后工单进入「维修中」，${w.level === '紧急' ? '紧急工单要求 60 分钟内响应' : '普通工单时限 240 分钟'}。</p>`,
        actions: [{
            label: '确认派工', className: 'btn-primary',
            onClick: (close, mask) => {
                const tech = mask.querySelector('#woTechSelect').value;
                dispatchWorkorder(w.id, tech);
                toast(`${w.id} 已派工给 ${tech}`, 'success');
                close(); refresh();
            }
        }]
    });
}

// 完工登记
function showFinishForm(id) {
    const store = getStore();
    const w = store.workorders.find(x => x.id === id);
    if (!w) return;
    const partOptions = ['（未更换配件）', '以太网模块 ×1', '温度传感器 ×1', '电源适配器 ×1', '传送带皮带 ×1', '闪烁探测器 ×1']
        .map(p => `<option value="${p}">${p}</option>`).join('');
    openModal({
        title: `维修完工登记 - ${w.id}`,
        width: 540,
        bodyHTML: `
            <div class="form-grid">
                <label>维修措施</label><textarea class="form-control" id="woRepairNote" rows="3" placeholder="如：清洁闪烁探测器并重新标定">${w.repairNote || ''}</textarea>
                <label>更换配件</label><select class="form-control" id="woPartsSelect">${partOptions}</select>
            </div>`,
        actions: [{
            label: '提交完工', className: 'btn-success',
            onClick: (close, mask) => {
                finishRepair(w.id, mask.querySelector('#woRepairNote').value.trim(), mask.querySelector('#woPartsSelect').value);
                toast(`${w.id} 已完工，转入待验收`, 'success');
                close(); refresh();
            }
        }]
    });
}

// 验收（通过 → 设备恢复在线 + 告警闭环；退回 → 重修）
function showAcceptForm(id) {
    const store = getStore();
    const w = store.workorders.find(x => x.id === id);
    if (!w) return;
    const captains = store.employees.filter(e => e.role === '值班队长');
    openModal({
        title: `工单验收 - ${w.id}`,
        width: 540,
        bodyHTML: `
            ${kvTableHTML([['设备', w.deviceName], ['维修措施', w.repairNote], ['更换配件', w.parts]])}
            <div class="form-grid" style="margin-top:10px;">
                <label>验收人</label>
                <select class="form-control" id="woAcceptorSelect">${captains.map(c => `<option value="值班队长·${c.name}">值班队长·${c.name}（${c.team}）</option>`).join('')}</select>
                <label>验收结论</label>
                <div><label style="color:#e6f2ff;margin-right:16px;"><input type="radio" name="woAcceptPass" value="pass" checked> 通过（设备恢复在线）</label>
                <label style="color:#e6f2ff;"><input type="radio" name="woAcceptPass" value="fail"> 退回重修</label></div>
                <label>意见</label><input class="form-control" id="woAcceptNote" placeholder="验收意见（选填）">
            </div>`,
        actions: [{
            label: '提交验收', className: 'btn-primary',
            onClick: (close, mask) => {
                const pass = mask.querySelector('input[name="woAcceptPass"]:checked').value === 'pass';
                const acceptor = mask.querySelector('#woAcceptorSelect').value;
                const note = mask.querySelector('#woAcceptNote').value.trim();
                acceptWorkorder(w.id, acceptor, pass, note);
                toast(pass ? `${w.id} 验收通过：${w.deviceName} 已恢复在线，关联告警闭环` : `${w.id} 已退回重修`, pass ? 'success' : 'warning');
                close(); refresh();
            }
        }]
    });
}

// 新建报修（选设备 → 填写故障）
function showNewRepairForm() {
    const store = getStore();
    const devOptions = store.devices.map(d =>
        `<option value="${d.id}">${d.displayName}（${d.channel} · ${d.status === 'online' ? '在线' : d.status === 'warning' ? '告警' : '离线'}）</option>`).join('');
    openModal({
        title: '新建报修工单',
        width: 560,
        bodyHTML: `
            <div class="form-grid">
                <label>故障设备</label><select class="form-control" id="woDevSelect">${devOptions}</select>
                <label>故障类型</label>
                <select class="form-control" id="woFaultSelect">
                    <option>图像质量异常</option><option>传送带异响</option><option>链路中断/心跳丢失</option>
                    <option>机身温度偏高</option><option>电源模块故障</option><option>自检报错</option><option>其他异常</option>
                </select>
                <label>紧急程度</label>
                <select class="form-control" id="woLevelSelect"><option>普通</option><option>紧急</option></select>
                <label>故障描述</label><textarea class="form-control" id="woDesc" rows="2" placeholder="现象、发生时间、已做的现场处置…"></textarea>
            </div>`,
        actions: [{
            label: '提交报修', className: 'btn-success',
            onClick: (close, mask) => {
                const r = createRepairOrder(
                    mask.querySelector('#woDevSelect').value,
                    mask.querySelector('#woFaultSelect').value,
                    mask.querySelector('#woLevelSelect').value,
                    mask.querySelector('#woDesc').value.trim());
                if (!r.ok) { toast(r.msg, 'error'); return; }
                toast(`报修成功，已生成工单 ${r.wo.id}，请在告警中心关注未处理告警`, 'success');
                close(); refresh();
            }
        }]
    });
}

function refresh() {
    applyFilters();
    renderStats();
    refreshNavBadges();
}

window.initWorkorderModule = function() {
    document.getElementById('woStatusFilter').onchange = applyFilters;
    document.getElementById('woLevelFilter').onchange = applyFilters;
    document.getElementById('woKeyword').onkeydown = (e) => { if (e.key === 'Enter') applyFilters(); };
    document.getElementById('woSearchBtn').onclick = applyFilters;
    document.getElementById('woNewBtn').onclick = showNewRepairForm;
    document.getElementById('woExportBtn').onclick = () => {
        exportCSV(`维保工单台账_${new Date().toISOString().slice(0, 10)}.csv`,
            ['工单号', '设备', '通道', '故障类型', '级别', '状态', '报修时间', '维修工程师', '维修措施', '更换配件', '验收人'],
            filtered.map(w => [w.id, w.deviceName, w.channel, w.faultType, w.level, w.status, w.time,
                w.technician || '-', w.repairNote || '-', w.parts || '-', w.acceptor || '-']));
    };
    refresh();
};
