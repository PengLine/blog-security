import { getStore, currentShiftDef, swapShiftMember, shiftWorkload } from './db.js';
import { toast, openModal, exportCSV } from './utils.js';

const ROLE_ORDER = ['值班队长', '判图员', '值机安检员', '复检员', '维修工程师'];

function renderBanner() {
    const store = getStore();
    const cur = currentShiftDef();
    const shift = store.shifts.find(s => s.key === cur.key);
    const captain = store.employees.find(e => shift.members.includes(e.id) && e.role === '值班队长');
    const now = new Date();
    const h = now.getHours();
    // 距下次交接班：早班→今天 20:00；晚班→(h>=20 ? 明天 8:00 : 今天 8:00)
    const next = new Date(now);
    if (cur.key === '早班') {
        next.setHours(20, 0, 0, 0);
    } else {
        if (h >= 20) next.setDate(next.getDate() + 1);
        next.setHours(8, 0, 0, 0);
    }
    const leftMin = Math.max(0, Math.round((next - now) / 60000));
    const leftTxt = leftMin >= 60 ? `${Math.floor(leftMin / 60)} 小时 ${leftMin % 60} 分` : `${leftMin} 分钟`;

    document.getElementById('shiftBanner').innerHTML = `
        <div>
            <div class="sb-label">当前班次</div>
            <div class="sb-value"><b>${cur.key}</b>（${cur.team}值守） ${cur.range}</div>
        </div>
        <div>
            <div class="sb-label">当班人数</div>
            <div class="sb-value"><b>${shift.members.length}</b> 人</div>
        </div>
        <div>
            <div class="sb-label">带班队长</div>
            <div class="sb-value"><b>${captain ? captain.name : '—'}</b></div>
        </div>
        <div>
            <div class="sb-label">距下次交接班</div>
            <div class="sb-value"><b>${leftTxt}</b></div>
        </div>`;
}

function renderCards() {
    const store = getStore();
    const curKey = currentShiftDef().key;
    const wrap = document.getElementById('shiftCards');
    wrap.innerHTML = '';

    store.shifts.forEach(s => {
        const card = document.createElement('div');
        card.className = `shift-card ${s.key === curKey ? 'active-shift' : ''}`;
        const emps = s.members.map(id => store.employees.find(e => e.id === id)).filter(Boolean);
        const byRole = ROLE_ORDER.map(r => ({ role: r, list: emps.filter(e => e.role === r) })).filter(g => g.list.length);
        card.innerHTML = `
            <div class="shift-head">
                <span class="s-name">${s.key} · ${s.team}</span>
                <span class="s-range">${s.range}</span>
            </div>
            <div style="font-size:12px;color:#909399;margin-bottom:8px;">${s.postNote}</div>
            ${byRole.map(g => `
                <div style="margin-bottom:6px;">
                    <span style="font-size:12px;color:#409eff;">${g.role}</span>
                    ${g.list.map(e => `
                        <span class="member-chip">${e.name}
                            <span class="m-role">${e.civilNo}</span>
                            <span class="m-swap" data-swap="${e.id}" title="与另一班次同岗位人员对调">换班</span>
                        </span>`).join('')}
                </div>`).join('')}
            <div style="margin-top:10px;font-size:12px;color:#909399;">
                开放通道：${s.key === '早班' ? 'CH-1 ~ CH-6 全开' : 'CH-1 ~ CH-2 保留'} · 备勤支援：质控员·孙瑞
            </div>`;
        wrap.appendChild(card);
    });

    wrap.querySelectorAll('[data-swap]').forEach(el => el.onclick = () => showSwapForm(el.dataset.swap));
}

// 换班：与另一班次的一名员工对调（同岗位优先推荐）
function showSwapForm(empId) {
    const store = getStore();
    const a = store.employees.find(e => e.id === empId);
    const curShift = store.shifts.find(s => s.members.includes(a.id));
    const other = store.shifts.find(s => s.key !== curShift.key);
    const candidates = other.members
        .map(id => store.employees.find(e => e.id === id))
        .filter(Boolean)
        .sort((x, y) => (x.role === a.role ? -1 : 0) - (y.role === a.role ? -1 : 0));
    if (!candidates.length) { toast('对方班次暂无可顶岗人员', 'warning'); return; }

    openModal({
        title: `换班申请 - ${a.name}`,
        width: 540,
        bodyHTML: `
            <div class="form-grid">
                <label>本人</label><input class="form-control" value="${a.name}（${a.role} · ${curShift.key}）" disabled>
                <label>对调人员</label>
                <select class="form-control" id="schSwapSelect">
                    ${candidates.map(c => `<option value="${c.id}">${c.name}（${c.role} · ${other.key}）${c.role === a.role ? ' ★同岗位' : ''}</option>`).join('')}
                </select>
            </div>
            <p style="margin-top:12px;font-size:12px;color:#909399;">
                换班需双方岗位可互顶（推荐同岗位对调），确认后即时生效并写入审计日志与事件中心；
                集中判图页的当班判图员下拉将同步更新。
            </p>`,
        actions: [{
            label: '确认对调', className: 'btn-primary',
            onClick: (close, mask) => {
                const bId = mask.querySelector('#schSwapSelect').value;
                const r = swapShiftMember(a.id, bId);
                if (!r.ok) { toast(r.msg, 'error'); return; }
                toast(`${r.msg}，已生效并留痕`, 'success');
                close(); refresh();
            }
        }]
    });
}

function renderWorkload() {
    const store = getStore();
    const tbody = document.getElementById('shiftWorkloadBody');
    tbody.innerHTML = '';
    shiftWorkload(store).forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${r.shift}</td>
            <td>${r.range}</td>
            <td>${r.members} 人</td>
            <td>${r.judged}</td>
            <td style="color:${r.danger > 0 ? '#f56c6c' : 'inherit'}">${r.danger}</td>
            <td>${r.seized}</td>
            <td>${r.alarms}</td>`;
        tbody.appendChild(tr);
    });
}

function refresh() {
    renderBanner();
    renderCards();
    renderWorkload();
}

window.initScheduleModule = function() {
    document.getElementById('schExportBtn').onclick = () => {
        const store = getStore();
        const rows = [];
        store.shifts.forEach(s => {
            s.members.map(id => store.employees.find(e => e.id === id)).filter(Boolean).forEach(e => {
                rows.push([s.key, s.range, s.team, e.name, e.role, e.civilNo]);
            });
        });
        exportCSV(`值班表_${new Date().toISOString().slice(0, 10)}.csv`,
            ['班次', '值守时段', '班组', '姓名', '岗位', '警号'], rows);
    };
    refresh();
};
