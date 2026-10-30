import {
    getStore, currentShiftDef, swapShiftMember, swapCandidates, shiftWorkload,
    shiftHandover, handoverProgress, confirmHandoverItem, completeHandover,
    attendanceBoard, rollCall, skillsMatrix, skillCoverage, SKILLS
} from './db.js';
import { toast, openModal, exportCSV } from './utils.js';

const ROLE_ORDER = ['值班队长', '判图员', '值机安检员', '复检员', '维修工程师'];
const ATT_CHIP = { present: 'chip-pass', late: 'chip-warn', leave: 'chip-info', off: 'chip-info' };
const ATT_NAME = { present: '在岗', late: '迟到', leave: '请假', off: '休班' };
const byId = id => document.getElementById(id);

const operator = () => getStore().currentUser.name;

// ---------- 当班横幅 ----------
function renderBanner() {
    const store = getStore();
    const cur = currentShiftDef();
    const shift = store.shifts.find(s => s.key === cur.key);
    const captain = store.employees.find(e => shift.members.includes(e.id) && e.role === '值班队长');
    const now = new Date();
    const next = new Date(now);
    if (cur.key === '早班') {
        next.setHours(20, 0, 0, 0);
    } else {
        if (now.getHours() >= 20) next.setDate(next.getDate() + 1);
        next.setHours(8, 0, 0, 0);
    }
    const leftMin = Math.max(0, Math.round((next - now) / 60000));
    const leftTxt = leftMin >= 60 ? `${Math.floor(leftMin / 60)} 小时 ${leftMin % 60} 分` : `${leftMin} 分钟`;
    const att = attendanceBoard(store);
    const hp = handoverProgress(shiftHandover(store));

    byId('shiftBanner').innerHTML = `
        <div>
            <div class="sb-label">当前班次</div>
            <div class="sb-value"><b>${cur.key}</b>（${cur.team}值守） ${cur.range}</div>
        </div>
        <div>
            <div class="sb-label">当班人员</div>
            <div class="sb-value"><b>${att.summary.present}</b>/${att.summary.should} 人在岗</div>
        </div>
        <div>
            <div class="sb-label">带班队长</div>
            <div class="sb-value"><b>${captain ? captain.name : '—'}</b></div>
        </div>
        <div>
            <div class="sb-label">交接进度</div>
            <div class="sb-value"><b>${hp.done}/${hp.total}</b> 项已确认</div>
        </div>
        <div>
            <div class="sb-label">距下次交接班</div>
            <div class="sb-value"><b>${leftTxt}</b></div>
        </div>`;
}

// ---------- 统计卡 ----------
function renderStats() {
    const store = getStore();
    const att = attendanceBoard(store);
    const hp = handoverProgress(shiftHandover(store));
    const cov = skillCoverage(store);
    const set = (id, v) => { const el = byId(id); if (el) el.textContent = v; };
    set('schStatPresent', `${att.summary.present}/${att.summary.should}`);
    set('schStatPresentHint', att.summary.present === att.summary.should ? '全员到岗' : `缺勤 ${att.summary.should - att.summary.present} 人待核验`);
    set('schStatAbsent', `${att.summary.late} / ${att.summary.leave}`);
    set('schStatAbsentHint', `休班 ${att.summary.off} 人`);
    set('schStatHandover', `${hp.percent}%`);
    set('schStatHandoverHint', hp.ready ? '可完成交接' : `待确认 ${hp.total - hp.done} 项`);
    set('schStatSkill', `${cov.rate}%`);
    set('schStatSkillHint', cov.gaps.length ? `缺口 ${cov.gaps.length} 项` : '关键岗位全覆盖');
}

// ---------- 班次与换班 ----------
function renderCards() {
    const store = getStore();
    const curKey = currentShiftDef().key;
    const wrap = byId('shiftCards');
    wrap.innerHTML = '';

    store.shifts.forEach(s => {
        const card = document.createElement('div');
        card.className = `shift-card ${s.key === curKey ? 'active-shift' : ''}`;
        const emps = s.members.map(id => store.employees.find(e => e.id === id)).filter(Boolean);
        const byRole = ROLE_ORDER.map(r => ({ role: r, list: emps.filter(e => e.role === r) })).filter(g => g.list.length);
        const att = attendanceBoard(store);
        card.innerHTML = `
            <div class="shift-head">
                <span class="s-name">${s.key} · ${s.team}</span>
                <span class="s-range">${s.range}${s.key === curKey ? ' · 当班' : ''}</span>
            </div>
            <div style="font-size:12px;color:#909399;margin-bottom:8px;">${s.postNote}</div>
            ${byRole.map(g => `
                <div style="margin-bottom:6px;">
                    <span style="font-size:12px;color:#409eff;">${g.role}</span>
                    ${g.list.map(e => {
                        const a = att.rows.find(r => r.empId === e.id);
                        const chip = a && a.inShift
                            ? `<span class="chip ${ATT_CHIP[a.status]}">${ATT_NAME[a.status]}</span>`
                            : '';
                        return `<span class="member-chip">${e.name}${chip}
                            <span class="m-role">${e.civilNo}</span>
                            <span class="m-swap" data-swap="${e.id}" title="与另一班次人员对调（按技能可顶排序）">换班</span>
                        </span>`;
                    }).join('')}
                </div>`).join('')}
            <div style="margin-top:10px;font-size:12px;color:#909399;">
                开放通道：${s.key === '早班' ? 'CH-1 ~ CH-6 全开' : 'CH-1 ~ CH-2 保留'} · 备勤支援：质控员·孙瑞
            </div>`;
        wrap.appendChild(card);
    });

    wrap.querySelectorAll('[data-swap]').forEach(el => el.onclick = () => showSwapForm(el.dataset.swap));
}

// 换班：候选人按技能可顶排序，技能不足在确认前提示（仍允许人工确认）
function showSwapForm(empId) {
    const store = getStore();
    const a = store.employees.find(e => e.id === empId);
    if (!a) return;
    const candidates = swapCandidates(empId);
    if (!candidates.length) { toast('对方班次暂无可对调人员', 'warning'); return; }
    const options = candidates.map(c => `
        <option value="${c.id}" data-ok="${c.ok ? '1' : '0'}" data-miss="${c.missing.join('、')}">
            ${c.name}（${c.role}）${c.ok ? ' · 可顶岗' : ' · 缺 ' + c.missing.join('/')}${c.sameRole ? ' ★同岗位' : ''}
        </option>`).join('');

    openModal({
        title: `换班申请 - ${a.name}`,
        width: 620,
        bodyHTML: `
            <div class="form-grid">
                <label>本人</label>
                <input class="form-control" value="${a.name}（${a.role} · ${a.team}）" disabled>
                <label>对调人员</label>
                <select class="form-control" id="schSwapSelect">${options}</select>
            </div>
            <div class="ho-actions-tip" id="schSwapTip" style="margin-top:10px;"></div>
            <p style="margin-top:10px;font-size:12px;color:#909399;">
                控制要求：对调人员应具备本岗位关键技能（≥2 级），系统已按此排序并标注技能缺口；
                确认后即时生效，写入审计日志与事件中心，集中判图页的当班判图员下拉同步更新。
            </p>`,
        actions: [{
            label: '确认对调', className: 'btn-primary',
            onClick: (close, mask) => {
                const sel = mask.querySelector('#schSwapSelect');
                const bId = sel.value;
                const target = candidates.find(c => c.id === bId);
                const r = swapShiftMember(a.id, bId);
                if (!r.ok) { toast(r.msg, 'error'); return; }
                const tip = target && !target.ok ? `（技能缺口：${target.missing.join('、')}，已记录待补训）` : '';
                toast(`${r.msg}${tip}`, target && target.ok ? 'success' : 'warning');
                close();
                refresh();
            }
        }]
    });

    // 选择变化时实时提示技能匹配情况
    const mask = byId('globalModalMask');
    if (!mask) return;
    const sel = mask.querySelector('#schSwapSelect');
    const tip = mask.querySelector('#schSwapTip');
    const updateTip = () => {
        const opt = sel.selectedOptions[0];
        const ok = opt && opt.dataset.ok === '1';
        const miss = opt ? opt.dataset.miss : '';
        tip.className = `ho-actions-tip ${ok ? 'is-ok' : 'is-warn'}`;
        tip.textContent = ok ? '技能校验通过：该人员可独立顶岗' : `技能缺口：${miss || '未评估'}，确认后计入补训清单`;
    };
    sel.onchange = updateTip;
    updateTip();
}

function renderWorkload() {
    const store = getStore();
    const tbody = byId('shiftWorkloadBody');
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

// ---------- 交接班 ----------
function renderHandover() {
    const store = getStore();
    const ho = shiftHandover(store);
    const hp = handoverProgress(ho);
    const head = byId('hoHead');
    if (head) {
        head.innerHTML = ho.completed
            ? `交接单 <b>${ho.id}</b> 已于 <b>${ho.completedTime}</b> 由 <b>${ho.completedBy}</b> 完成：${ho.shiftKey}（${ho.shiftTeam}）→ ${ho.nextKey}（${ho.nextTeam}）。${ho.note}`
            : `交接单 <b>${ho.id}</b>｜<b>${ho.shiftKey}</b>（${ho.shiftTeam}）→ <b>${ho.nextKey}</b>（${ho.nextTeam}）｜
               进度 <b>${hp.done}/${hp.total}</b>（${hp.percent}%）｜未确认项每 30 秒随业务数据自动刷新摘要`;
    }
    const tbody = byId('hoTableBody');
    if (tbody) {
        tbody.innerHTML = ho.items.map(it => `
            <tr>
                <td>${it.label}<div style="font-size:11px;color:#909399">${it.hint}</div></td>
                <td>${it.autoText}${it.note ? `<div style="font-size:11px;color:#e6a23c">备注：${it.note}</div>` : ''}</td>
                <td>${it.status === '已确认'
                    ? '<span class="chip chip-pass">已确认</span>'
                    : '<span class="chip chip-warn">待确认</span>'}</td>
                <td>${it.by ? `${it.by}<div style="font-size:11px;color:#909399">${it.ts}</div>` : '—'}</td>
                <td>${it.status === '已确认' || ho.completed
                    ? '<span style="color:#909399;font-size:12px;">完成</span>'
                    : `<button class="btn btn-small btn-primary" data-ho="${it.key}">确认</button>`}</td>
            </tr>`).join('');
        tbody.querySelectorAll('[data-ho]').forEach(btn => {
            btn.onclick = () => {
                const r = confirmHandoverItem(btn.dataset.ho, operator());
                if (!r.ok) { toast(r.msg, 'warning'); return; }
                toast(`「${r.item.label}」已确认（${r.progress.done}/${r.progress.total}）`, 'success');
                refresh();
            };
        });
    }
    const tip = byId('hoActionTip');
    if (tip) {
        tip.className = `ho-actions-tip ${ho.completed ? 'is-ok' : hp.ready ? 'is-ok' : 'is-warn'}`;
        tip.textContent = ho.completed
            ? '交接单已完成并留痕，可在事件中心查看'
            : hp.ready ? '全部检查项已确认，可完成交接' : `仍有 ${hp.total - hp.done} 项未确认，完成后才能提交`;
    }
    const btn = byId('hoCompleteBtn');
    if (btn) {
        btn.disabled = ho.completed;
        btn.textContent = ho.completed ? '已完成交接' : '完成交接班';
    }
}

// ---------- 考勤与在岗 ----------
function renderAttendance() {
    const store = getStore();
    const board = attendanceBoard(store);
    const head = byId('attHead');
    if (head) {
        head.innerHTML = `当前班次 <b>${board.shiftKey}</b>（${board.shiftTeam}）｜应到 <b>${board.summary.should}</b> 人，
            在岗 <b>${board.summary.present}</b> 人，迟到 <b>${board.summary.late}</b> 人，请假 <b>${board.summary.leave}</b> 人，
            休班 <b>${board.summary.off}</b> 人；点名核验结果实时写入审计日志。`;
    }
    const tbody = byId('attTableBody');
    if (!tbody) return;
    tbody.innerHTML = board.rows.map(r => `
        <tr>
            <td>${r.name}<div style="font-size:11px;color:#909399">${r.empId}</div></td>
            <td>${r.role}</td>
            <td>${r.team}</td>
            <td>${r.inShift ? board.shiftKey : '休班'}</td>
            <td><span class="chip ${ATT_CHIP[r.status]}">${ATT_NAME[r.status]}</span></td>
            <td>${r.checkTime}</td>
            <td>${r.checkedBy ? `点名核验：${r.checkedBy}` : r.verified ? '系统签到已核验' : '<span style="color:#909399;">待核验</span>'}</td>
            <td>${r.inShift && !r.verified
                ? `<button class="btn btn-small btn-primary" data-roll="${r.empId}">点名</button>`
                : '<span style="color:#909399;font-size:12px;">—</span>'}</td>
        </tr>`).join('');
    tbody.querySelectorAll('[data-roll]').forEach(btn => {
        btn.onclick = () => {
            const res = rollCall(btn.dataset.roll, operator());
            if (!res.ok) { toast(res.msg, 'warning'); return; }
            toast(`${res.row.name} 已核验在岗`, 'success');
            refresh();
        };
    });
}

// ---------- 技能矩阵 ----------
function dots(level) {
    return '<span class="skill-dots">'
        + [0, 1, 2].map(i => `<i class="${i < level ? 'on' : ''}"></i>`).join('')
        + `</span><small class="skill-lv">${level} 级</small>`;
}

function renderSkills() {
    const store = getStore();
    const m = skillsMatrix(store);
    const cov = skillCoverage(store);
    const head = byId('skillHead');
    if (head) {
        head.innerHTML = `关键岗位-技能组合共 <b>${cov.total}</b> 项，已覆盖 <b>${cov.covered}</b> 项（<b>${cov.rate}%</b>）；
            判图员需 X光判图、复检员需复检开包、值机员需人证核验、队长需现场指挥、维修需设备维保，均以 ≥2 级为达标线。`;
    }
    const headRow = byId('skillHeadRow');
    if (headRow) {
        headRow.innerHTML = `<tr><th>姓名 / 岗位</th><th style="width:90px;">班组</th>
            ${SKILLS.map(s => `<th style="width:120px;" title="${s.desc}">${s.name}</th>`).join('')}</tr>`;
    }
    const tbody = byId('skillTableBody');
    if (tbody) {
        tbody.innerHTML = m.rows
            .slice()
            .sort((a, b) => a.team.localeCompare(b.team) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
            .map(r => `<tr>
                <td>${r.name}<div style="font-size:11px;color:#909399">${r.role}</div></td>
                <td>${r.team}</td>
                ${SKILLS.map(s => `<td>${dots(r.levels[s.key] || 0)}</td>`).join('')}
            </tr>`).join('');
    }
    const gapBox = byId('skillGaps');
    if (gapBox) {
        gapBox.innerHTML = cov.gaps.length
            ? cov.gaps.map(g => `<div class="principle-card is-warn"><b>${g.team} · ${g.role}</b><small>${g.msg}</small></div>`).join('')
            : '<div class="principle-card is-ok"><b>关键岗位技能全覆盖</b><small>两个班次在所有关键岗位-技能组合上均有 ≥2 级人员，可支持正常顶岗与换班。</small></div>';
    }
}

// ---------- 刷新与导出 ----------
function refresh() {
    renderBanner();
    renderStats();
    renderCards();
    renderWorkload();
    renderHandover();
    renderAttendance();
    renderSkills();
}

function setupTabs() {
    const nav = document.querySelector('#schedule .tab-nav');
    if (!nav || nav.dataset.bound) return;
    nav.dataset.bound = '1';
    nav.querySelectorAll('.tab-nav-item').forEach(item => {
        item.onclick = () => {
            nav.querySelectorAll('.tab-nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('#schedule .tab-content').forEach(c => c.classList.remove('active'));
            const pane = byId(item.dataset.tab);
            if (pane) pane.classList.add('active');
        };
    });
}

window.initScheduleModule = function () {
    setupTabs();

    byId('hoCompleteBtn').onclick = () => {
        const r = completeHandover(operator(), '交接双方现场确认');
        if (!r.ok) { toast(r.msg, 'error'); return; }
        toast(`交接班已完成（${r.handover.shiftKey}→${r.handover.nextKey}），已留痕`, 'success');
        refresh();
    };

    byId('schExportBtn').onclick = () => {
        const store = getStore();
        const att = attendanceBoard(store);
        const m = skillsMatrix(store);
        const rows = [];
        store.shifts.forEach(s => {
            s.members.map(id => store.employees.find(e => e.id === id)).filter(Boolean).forEach(e => {
                const a = att.rows.find(r => r.empId === e.id) || {};
                const row = m.rows.find(r => r.empId === e.id) || { levels: {} };
                rows.push([s.key, s.range, s.team, e.name, e.role, e.civilNo,
                    a.inShift ? ATT_NAME[a.status] : '休班', a.checkTime || '-',
                    SKILLS.reduce((sum, sk) => sum + (row.levels[sk.key] || 0), 0)]);
            });
        });
        exportCSV(`值班表_${new Date().toISOString().slice(0, 10)}.csv`,
            ['班次', '值守时段', '班组', '姓名', '岗位', '警号', '考勤状态', '签到时间', '技能总级数'], rows);
        toast(`已导出 ${rows.length} 条值班记录`, 'success');
    };

    refresh();
};
