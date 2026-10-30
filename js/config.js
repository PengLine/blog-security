import {
    getStore, CONTRABAND_TYPES, configImpact, publishConfig,
    rollbackConfigVersion, toggleConfigStatus, validateConfigDetails
} from './db.js';
import { toast, openModal, kvTableHTML, paginateData, fmtDateTime, exportCSV } from './utils.js';

const configTypeMap = {
    device: '设备配置',
    event: '事件配置',
    system: '系统配置',
    face: '人脸/测温配置'
};

const STATUS_CHIP = { '已发布': 'chip-pass', '待发布': 'chip-warn', '已停用': 'chip-danger' };

let currentPage = 1;
const perPage = 20;
let filteredConfigs = [];
let versionConfigId = 'ALL';

const operator = () => `系统管理员·${getStore().currentUser.name}`;

function audit(action, target) {
    const store = getStore();
    store.auditLogs.unshift({ time: fmtDateTime(Date.now()), user: operator(), action, target });
}

function initTabs() {
    const navs = document.querySelectorAll('#config .tab-nav-item');
    const contents = document.querySelectorAll('#config .tab-content');
    navs.forEach(item => {
        item.onclick = () => {
            navs.forEach(n => n.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            item.classList.add('active');
            const target = document.getElementById(item.dataset.tab);
            if (target) target.classList.add('active');
            if (item.dataset.tab === 'cfgVersions') renderVersions();
            if (item.dataset.tab === 'cfgDelivery') renderDelivery();
        };
    });
}

function renderStats() {
    const store = getStore();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const impacts = store.configs.map(c => configImpact(c));
    const deviceIds = new Set();
    store.configs.forEach((c, i) => {
        const imp = impacts[i];
        if (imp.deviceKeys.length) {
            store.devices.filter(d => imp.deviceKeys.includes(d.key)).forEach(d => deviceIds.add(d.id));
        }
    });
    set('cfgStatTotal', store.configs.length);
    set('cfgStatPublished', store.configs.filter(c => c.status === '已发布').length);
    set('cfgStatDraft', store.configs.filter(c => c.status !== '已发布').length);
    set('cfgStatDevices', deviceIds.size);
    set('cfgStatCache', new Set(impacts.flatMap(i => i.cacheKeys)).size);
    set('cfgStatVersions', store.configVersions.length);
}

function applyFilters() {
    const store = getStore();
    const type = document.getElementById('configTypeFilter').value;
    const status = document.getElementById('configStatusFilter').value;
    const name = document.getElementById('configNameFilter').value.trim();
    filteredConfigs = store.configs.filter(c => {
        if (type && c.type !== type) return false;
        if (status && c.status !== status) return false;
        if (name && !(c.name + c.id).includes(name)) return false;
        return true;
    });
    currentPage = 1;
    renderConfigs(paginateData(filteredConfigs, currentPage, perPage));
    renderConfigPagination();
}

function renderConfigs(configs) {
    const tbody = document.getElementById('configsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!configs.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#909399;">没有符合条件的配置</td></tr>';
        return;
    }

    configs.forEach(config => {
        const imp = configImpact(config);
        const chip = STATUS_CHIP[config.status] || 'chip-info';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${config.id}</td>
            <td>${config.name}<div style="font-size:11px;color:#909399">${config.description || ''}</div></td>
            <td>${configTypeMap[config.type] || config.type}</td>
            <td>${config.version || '—'}</td>
            <td><span class="chip ${chip}">${config.status}</span></td>
            <td>${config.scope || ''}</td>
            <td>${imp.deviceCount ? `${imp.deviceCount} 台` : '软件配置'}
                ${imp.deviceCount && imp.onlineCount < imp.deviceCount ? `<div style="font-size:11px;color:#e6a23c;">${imp.deviceCount - imp.onlineCount} 台离线待补发</div>` : ''}
            </td>
            <td>${config.updateTime}</td>
            <td>
                <button class="btn btn-small btn-primary" data-edit="${config.id}">编辑</button>
                <button class="btn btn-small btn-secondary" data-ver="${config.id}">版本</button>
                ${config.status === '待发布' ? `<button class="btn btn-small btn-success" data-pub="${config.id}">发布</button>` : ''}
                <button class="btn btn-small btn-secondary" data-toggle="${config.id}">${config.status === '已停用' ? '启用' : '停用'}</button>
                <button class="btn btn-small btn-danger" data-del="${config.id}">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => editConfig(btn.dataset.edit));
    tbody.querySelectorAll('[data-ver]').forEach(btn => btn.onclick = () => {
        versionConfigId = btn.dataset.ver;
        const tab = document.querySelector('#config .tab-nav-item[data-tab="cfgVersions"]');
        if (tab) tab.click();
        const sel = document.getElementById('cfgVersionConfig');
        if (sel) sel.value = versionConfigId;
        renderVersions();
    });
    tbody.querySelectorAll('[data-pub]').forEach(btn => btn.onclick = () => doPublish(btn.dataset.pub));
    tbody.querySelectorAll('[data-toggle]').forEach(btn => btn.onclick = () => {
        const res = toggleConfigStatus(btn.dataset.toggle, operator());
        if (res.ok) toast(`配置已${res.status === '已停用' ? '停用（规则缓存不再下发）' : '启用'}`, 'success');
        refreshAll();
    });
    tbody.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => deleteConfig(btn.dataset.del));
}

// 参数取值：按原值类型转换，避免把 true / 1 写成字符串
function parseInput(raw, original) {
    if (typeof original === 'number') {
        const n = Number(raw);
        return raw === '' || Number.isNaN(n) ? raw : n;
    }
    if (typeof original === 'boolean') return raw === 'true';
    if (original && typeof original === 'object') {
        try { return JSON.parse(raw); } catch (e) { return raw; }
    }
    return raw;
}

function collectDetails(mask, original) {
    const next = {};
    mask.querySelectorAll('input[data-key]').forEach(inp => {
        const k = inp.dataset.key;
        next[k] = parseInput(inp.value, original[k]);
    });
    return next;
}

function diffHTML(original, next) {
    const rows = Object.keys(next).filter(k => JSON.stringify(original[k]) !== JSON.stringify(next[k]));
    if (!rows.length) return '<span style="color:#909399;">参数未发生变化</span>';
    return rows.map(k => `<div class="cfg-diff-row">
        <span class="cfg-diff-k">${k}</span>
        <span class="cfg-diff-old">${JSON.stringify(original[k])}</span>
        <span class="cfg-diff-arrow">→</span>
        <span class="cfg-diff-new">${JSON.stringify(next[k])}</span>
    </div>`).join('');
}

function editConfig(configId) {
    const store = getStore();
    const config = store.configs.find(c => c.id === configId);
    if (!config) return;
    const original = JSON.parse(JSON.stringify(config.configDetails));
    const imp = configImpact(config);

    const fields = Object.entries(original).map(([k, v]) => `
        <div class="cfg-field">
            <label>${k}</label>
            <input class="form-control" data-key="${k}" value="${typeof v === 'object' ? JSON.stringify(v) : v}">
            <small class="cfg-issue" data-issue="${k}"></small>
        </div>`).join('');

    const bodyHTML = `
        ${kvTableHTML([
            ['配置ID / 类型', `${config.id} / ${configTypeMap[config.type]}`],
            ['当前版本 / 状态', `${config.version}（${config.status}）`],
            ['生效范围', config.scope],
            ['影响设备', imp.deviceCount ? `${imp.deviceCount} 台（在线 ${imp.onlineCount} 台${imp.deviceCount > imp.onlineCount ? `，${imp.deviceCount - imp.onlineCount} 台离线待补发` : ''}）` : '纯软件配置，无硬件下发'],
            ['规则缓存', imp.cacheKeys.length ? `${imp.cacheKeys.join('、')}（TTL 300s）` : '不涉及规则缓存']
        ])}
        <div class="sub-title">参数调整</div>
        <div class="cfg-form">${fields}</div>
        <div class="sub-title">变更预览</div>
        <div class="cfg-diff" id="cfgDiffBox"></div>
        <div class="cfg-issues" id="cfgIssueBox"></div>
        <p style="margin-top:10px;font-size:12px;color:#909399;">「保存并发布」会生成新版本并刷新规则缓存；「保存为待发布」只改参数，待确认后再下发。</p>`;

    const doSave = (publishNow, close, mask) => {
        const next = collectDetails(mask, original);
        const issues = validateConfigDetails(next);
        const errors = issues.filter(i => i.level === 'error');
        if (errors.length) {
            toast(`参数校验未通过：${errors.map(e => `${e.key} ${e.msg}`).join('；')}`, 'error');
            return;
        }
        const changed = Object.keys(next).filter(k => JSON.stringify(original[k]) !== JSON.stringify(next[k]));
        if (!changed.length && !publishNow) { toast('未检测到变更', 'info'); return; }

        config.configDetails = next;
        if (publishNow) {
            const res = publishConfig(config.id, operator(), `界面调整 ${changed.length} 项：${changed.join('、')}`);
            if (!res.ok) { toast(res.msg, 'error'); return; }
            toast(`配置 ${config.name} 已发布 ${res.version.version}，规则缓存已刷新`, 'success');
        } else {
            config.status = '待发布';
            config.updateTime = fmtDateTime(Date.now());
            audit(`保存配置 ${config.name} 待发布（${changed.length} 项变更）`, config.id);
            toast(`已保存为待发布（${changed.length} 项变更）`, 'info');
        }
        close();
        refreshAll();
    };

    openModal({
        title: `${config.name}（${config.id}）`,
        width: 680,
        bodyHTML,
        actions: [
            { label: '保存为待发布', className: 'btn-secondary', onClick: (close, mask) => doSave(false, close, mask) },
            { label: '保存并发布', className: 'btn-success', onClick: (close, mask) => doSave(true, close, mask) }
        ]
    });

    const mask = document.getElementById('globalModalMask');
    if (!mask) return;
    const update = () => {
        const next = collectDetails(mask, original);
        const box = mask.querySelector('#cfgDiffBox');
        if (box) box.innerHTML = diffHTML(original, next);
        const issues = validateConfigDetails(next);
        mask.querySelectorAll('.cfg-issue').forEach(el => {
            const hit = issues.find(i => i.key === el.dataset.issue);
            el.textContent = hit ? hit.msg : '';
            el.className = `cfg-issue ${hit ? (hit.level === 'error' ? 'is-error' : 'is-warn') : ''}`;
        });
        const issueBox = mask.querySelector('#cfgIssueBox');
        if (issueBox) {
            issueBox.innerHTML = issues.length
                ? issues.map(i => `<div class="cfg-issue-line ${i.level === 'error' ? 'is-error' : 'is-warn'}">${i.level === 'error' ? '阻塞' : '提醒'}：${i.key} ${i.msg}</div>`).join('')
                : '<div class="cfg-issue-line is-ok">参数校验通过</div>';
        }
    };
    mask.querySelectorAll('input[data-key]').forEach(inp => { inp.oninput = update; });
    update();
}

function doPublish(configId) {
    const store = getStore();
    const cfg = store.configs.find(c => c.id === configId);
    if (!cfg) return;
    const imp = configImpact(cfg);
    openModal({
        title: `发布配置 - ${cfg.name}`,
        width: 560,
        bodyHTML: `
            ${kvTableHTML([
                ['配置ID', cfg.id],
                ['待发布版本', `将生成 ${cfg.version === '—' ? 'v1.0' : `新版本（当前 ${cfg.version}）`}`],
                ['目标设备', imp.deviceCount ? `${imp.deviceCount} 台（在线 ${imp.onlineCount} 台）` : '纯软件配置，无硬件下发'],
                ['刷新缓存', imp.cacheKeys.length ? imp.cacheKeys.join('、') : '不涉及规则缓存'],
                ['参数摘要', Object.entries(cfg.configDetails).slice(0, 5).map(([k, v]) => `${k}=${v}`).join('，')]
            ])}
            <div class="cfg-issues" style="margin-top:12px;">
                ${validateConfigDetails(cfg.configDetails).map(i => `<div class="cfg-issue-line ${i.level === 'error' ? 'is-error' : 'is-warn'}">${i.key} ${i.msg}</div>`).join('') || '<div class="cfg-issue-line is-ok">参数校验通过，可安全下发</div>'}
            </div>`,
        actions: [{
            label: '确认发布',
            className: 'btn-success',
            onClick: (close) => {
                const res = publishConfig(cfg.id, operator(), '界面确认发布');
                if (!res.ok) { toast(res.msg, 'error'); return; }
                toast(`配置 ${cfg.name} 已发布 ${res.version.version}`, 'success');
                close();
                refreshAll();
            }
        }]
    });
}

function deleteConfig(configId) {
    const store = getStore();
    const config = store.configs.find(c => c.id === configId);
    if (!config) return;
    const imp = configImpact(config);
    openModal({
        title: '删除确认',
        width: 460,
        bodyHTML: `<p>确定删除配置 <b style="color:#f56c6c">${config.name}</b>（${config.id}）吗？</p>
            <p style="margin-top:8px;font-size:12px;color:#909399;line-height:1.8;">
                影响设备 ${imp.deviceCount} 台将回退默认参数；${imp.cacheKeys.length ? `规则缓存 ${imp.cacheKeys.join('、')} 将失效；` : ''}历史版本保留归档，不再参与下发。</p>`,
        actions: [{
            label: '删除',
            className: 'btn-danger',
            onClick: (close) => {
                store.configs = store.configs.filter(c => c.id !== configId);
                audit(`删除配置 ${config.name}（影响 ${imp.deviceCount} 台设备）`, configId);
                toast('配置已删除，设备将回退默认参数', 'info');
                close();
                refreshAll();
            }
        }]
    });
}

// 违禁品名录（判图/交接/分类门共用字典）
function showContrabandCatalog() {
    const store = getStore();
    const rows = CONTRABAND_TYPES.flatMap(c => c.items.map(item => {
        const hits = store.handoffs.filter(h => h.category === c.name).length;
        return `
        <tr>
            <td>${item}</td>
            <td>${c.name}</td>
            <td><span class="chip ${c.level === 'severe' ? 'chip-danger' : 'chip-warn'}">${c.level === 'severe' ? '禁止携带' : '限制携带'}</span></td>
            <td>${c.level === 'severe' ? '一律查扣并移交民警' : '超限查扣 / 旅客自弃或寄存'}</td>
            <td>${hits}</td>
        </tr>`;
    }));
    openModal({
        title: '违禁品名录（判图辅助库 v3.5.2）',
        width: 680,
        bodyHTML: `<table class="data-table"><thead><tr><th>物品</th><th>类别</th><th>级别</th><th>处置标准</th><th>累计查获</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
    });
}

function addConfig() {
    const store = getStore();
    openModal({
        title: '新增配置',
        width: 560,
        bodyHTML: `
            <div class="form-grid">
                <label>配置名称</label><input class="form-control" id="cfgNewName" placeholder="如：5号通道液探阈值">
                <label>配置类型</label>
                <select class="form-control" id="cfgNewType">
                    <option value="device">设备配置</option><option value="event">事件配置</option>
                    <option value="system">系统配置</option><option value="face">人脸/测温配置</option>
                </select>
                <label>生效范围</label><input class="form-control" id="cfgNewScope" placeholder="设备 / 通道 / 全局">
                <label>参数(JSON)</label><textarea class="form-control" id="cfgNewDetails" rows="4" placeholder='{"阈值": 50, "灵敏度": 80}'></textarea>
            </div>
            <p style="margin-top:10px;font-size:12px;color:#909399;">新配置创建后为「待发布」状态，发布时才写入设备与规则缓存。</p>`,
        actions: [{
            label: '创建',
            className: 'btn-primary',
            onClick: (close, mask) => {
                const name = mask.querySelector('#cfgNewName').value.trim();
                if (!name) { toast('请填写配置名称', 'warning'); return; }
                let details;
                try {
                    details = JSON.parse(mask.querySelector('#cfgNewDetails').value || '{}');
                } catch (e) { toast('参数需为合法 JSON', 'error'); return; }
                const issues = validateConfigDetails(details);
                const errors = issues.filter(i => i.level === 'error');
                if (errors.length) { toast(`参数校验未通过：${errors.map(e => `${e.key} ${e.msg}`).join('；')}`, 'error'); return; }

                const maxNo = Math.max(0, ...store.configs.map(c => Number(String(c.id).replace('CFG-', '')) || 0));
                const now = fmtDateTime(Date.now());
                const cfg = {
                    id: `CFG-${String(maxNo + 1).padStart(3, '0')}`,
                    name,
                    type: mask.querySelector('#cfgNewType').value,
                    scope: mask.querySelector('#cfgNewScope').value.trim() || '全局',
                    createTime: now, updateTime: now,
                    description: '手工创建的配置项',
                    status: '待发布', version: '—',
                    configDetails: details
                };
                store.configs.unshift(cfg);
                audit(`新增配置 ${name}（待发布）`, cfg.id);
                toast(`配置「${name}」已创建，待发布后生效`, 'success');
                close();
                refreshAll();
            }
        }]
    });
}

function renderVersionSelect() {
    const store = getStore();
    const sel = document.getElementById('cfgVersionConfig');
    if (!sel) return;
    sel.innerHTML = '<option value="ALL">全部配置</option>' +
        store.configs.map(c => `<option value="${c.id}">${c.id} · ${c.name}</option>`).join('');
    sel.value = versionConfigId;
}

function snapshotSummary(snapshot) {
    const entries = Object.entries(snapshot || {});
    return entries.slice(0, 4).map(([k, v]) => `${k}=${v}`).join('，') + (entries.length > 4 ? ' …' : '');
}

function renderVersions() {
    const store = getStore();
    const status = document.getElementById('cfgVersionStatus').value;
    let list = store.configVersions.slice().sort((a, b) => b.ts - a.ts);
    if (versionConfigId !== 'ALL') list = list.filter(v => v.configId === versionConfigId);
    if (status) list = list.filter(v => v.status === status);

    const body = document.getElementById('cfgVersionBody');
    if (!body) return;
    body.innerHTML = list.length ? list.map(v => {
        const cfg = store.configs.find(c => c.id === v.configId);
        const chip = v.status === '已发布' ? 'chip-pass' : 'chip-info';
        return `
        <tr>
            <td>${v.version}<div style="font-size:11px;color:#909399;">${v.configId}${cfg ? ` · ${cfg.name}` : '（配置已删除）'}</div></td>
            <td><span class="chip ${chip}">${v.status}</span></td>
            <td>${v.changeCount || 0} 项</td>
            <td style="font-size:12px;color:#c0c4cc;">${snapshotSummary(v.snapshot)}</td>
            <td>${v.operator}</td>
            <td>${v.time}</td>
            <td>${v.note}${v.rollbackFrom ? `<div style="font-size:11px;color:#e6a23c;">回滚来源 ${v.rollbackFrom}</div>` : ''}</td>
            <td>
                <button class="btn btn-small btn-primary" data-cmp="${v.id}">对比</button>
                ${v.status !== '已发布' ? `<button class="btn btn-small btn-secondary" data-rollback="${v.id}">回滚</button>` : ''}
            </td>
        </tr>`;
    }).join('') : '<tr><td colspan="8" style="text-align:center;color:#909399;">暂无版本记录</td></tr>';

    const stat = document.getElementById('cfgVersionStat');
    if (stat) stat.textContent = `共 ${list.length} 个版本（已发布 ${list.filter(v => v.status === '已发布').length}）`;

    body.querySelectorAll('[data-cmp]').forEach(btn => btn.onclick = () => compareVersion(btn.dataset.cmp));
    body.querySelectorAll('[data-rollback]').forEach(btn => btn.onclick = () => confirmRollback(btn.dataset.rollback));
}

function compareVersion(versionId) {
    const store = getStore();
    const ver = store.configVersions.find(v => v.id === versionId);
    if (!ver) return;
    const cfg = store.configs.find(c => c.id === ver.configId);
    if (!cfg) { toast('对应配置已删除，仅可查看快照', 'warning'); return; }
    const cur = cfg.configDetails || {};
    const keys = [...new Set([...Object.keys(cur), ...Object.keys(ver.snapshot || {})])];
    const rows = keys.map(k => {
        const a = cur[k], b = (ver.snapshot || {})[k];
        const diff = JSON.stringify(a) !== JSON.stringify(b);
        return `<tr${diff ? ' style="background:rgba(64,158,255,0.08)"' : ''}>
            <td>${k}</td><td>${a ?? '—'}</td><td>${b ?? '—'}</td>
            <td>${diff ? '<span class="chip chip-warn">不同</span>' : '<span class="chip chip-pass">一致</span>'}</td>
        </tr>`;
    }).join('');
    openModal({
        title: `参数对比 - ${cfg.name} ${ver.version}`,
        width: 640,
        bodyHTML: `<table class="data-table"><thead><tr><th>参数</th><th>当前生效</th><th>${ver.version}</th><th>差异</th></tr></thead><tbody>${rows}</tbody></table>
            <p style="margin-top:10px;font-size:12px;color:#909399;">该版本由 ${ver.operator} 于 ${ver.time} 发布（${ver.status}）。</p>`
    });
}

function confirmRollback(versionId) {
    const store = getStore();
    const ver = store.configVersions.find(v => v.id === versionId);
    if (!ver) return;
    const cfg = store.configs.find(c => c.id === ver.configId);
    if (!cfg) return;
    const imp = configImpact(cfg);
    openModal({
        title: `回滚确认 - ${cfg.name} → ${ver.version}`,
        width: 560,
        bodyHTML: `${kvTableHTML([
            ['目标版本', `${ver.version}（${ver.note}）`],
            ['当前版本', `${cfg.version}（${cfg.status}）`],
            ['回滚方式', '以目标版本快照覆盖当前参数，并生成新版本留痕'],
            ['影响设备', imp.deviceCount ? `${imp.deviceCount} 台（在线 ${imp.onlineCount} 台）` : '纯软件配置'],
            ['刷新缓存', imp.cacheKeys.length ? imp.cacheKeys.join('、') : '不涉及规则缓存']
        ])}
        <p style="margin-top:10px;font-size:12px;color:#e6a23c;">回滚会立即下发，请确认目标版本参数已核对。</p>`,
        actions: [{
            label: '确认回滚',
            className: 'btn-danger',
            onClick: (close) => {
                const res = rollbackConfigVersion(cfg.id, versionId, operator());
                if (!res.ok) { toast(res.msg, 'error'); return; }
                toast(`已回滚至 ${ver.version}，并生成新版本 ${res.version.version}`, 'success');
                close();
                refreshAll();
            }
        }]
    });
}

function renderDelivery() {
    const store = getStore();
    const body = document.getElementById('cfgDeliveryBody');
    if (!body) return;
    body.innerHTML = store.configs.map(cfg => {
        const imp = configImpact(cfg);
        const state = cfg.status === '已发布'
            ? (imp.deviceCount && imp.onlineCount < imp.deviceCount ? '部分待补发' : '已下发')
            : (cfg.status === '待发布' ? '待下发' : '已撤销');
        const chip = state === '已下发' ? 'chip-pass' : (state === '待下发' ? 'chip-warn' : 'chip-danger');
        const offline = imp.offlineDevices.map(d => `${d.displayName}（${d.status === 'offline' ? '离线' : '告警'}）`).join('、') || '—';
        return `
        <tr>
            <td>${cfg.name}<div style="font-size:11px;color:#909399;">${cfg.id} · ${cfg.version}</div></td>
            <td style="font-size:12px;">${imp.cacheKeys.length ? imp.cacheKeys.join('<br>') : '<span style="color:#909399;">—</span>'}</td>
            <td>${imp.cacheKeys.length ? '300s' : '—'}</td>
            <td>${imp.deviceCount ? `${imp.deviceCount} 台` : '—'}</td>
            <td>${imp.deviceCount ? `${imp.onlineCount} 台` : '—'}</td>
            <td><span class="chip ${chip}">${state}</span></td>
            <td>${cfg.status === '已停用' ? '—' : cfg.updateTime}</td>
            <td style="font-size:12px;color:${offline === '—' ? '#909399' : '#e6a23c'};">${offline}</td>
        </tr>`;
    }).join('');
}

function renderAuditLogs() {
    const store = getStore();
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    const kw = (document.getElementById('cfgAuditKeyword') || {}).value || '';
    const logs = store.auditLogs.filter(l => !kw || (l.user + l.action + l.target).includes(kw)).slice(0, 40);
    tbody.innerHTML = logs.map(l => `<tr><td>${l.time}</td><td>${l.user}</td><td>${l.action}</td><td>${l.target}</td></tr>`).join('')
        || '<tr><td colspan="4" style="text-align:center;color:#909399;">没有匹配的审计记录</td></tr>';
    const stat = document.getElementById('cfgAuditStat');
    if (stat) stat.textContent = `匹配 ${logs.length} 条 / 全部 ${store.auditLogs.length} 条`;
}

function renderConfigPagination() {
    const tableSection = document.querySelector('#config #cfgItems .table-section');
    if (!tableSection) return;
    let paginationDiv = tableSection.querySelector('.pagination-page');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-page';
        tableSection.appendChild(paginationDiv);
    }
    const totalPages = Math.ceil(filteredConfigs.length / perPage);
    if (totalPages <= 1) { paginationDiv.innerHTML = ''; return; }
    paginationDiv.innerHTML = `
        <button class="btn btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} id="cfgPrev">上一页</button>
        <span class="page-info">第 ${currentPage} 页，共 ${totalPages} 页（${filteredConfigs.length} 条）</span>
        <button class="btn btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} id="cfgNext">下一页</button>
    `;
    document.getElementById('cfgPrev').onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            renderConfigs(paginateData(filteredConfigs, currentPage, perPage));
            renderConfigPagination();
        }
    };
    document.getElementById('cfgNext').onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderConfigs(paginateData(filteredConfigs, currentPage, perPage));
            renderConfigPagination();
        }
    };
}

function publishAllPending() {
    const store = getStore();
    const pending = store.configs.filter(c => c.status === '待发布');
    if (!pending.length) { toast('没有待发布的配置', 'info'); return; }
    let ok = 0;
    pending.forEach(c => { if (publishConfig(c.id, operator(), '批量发布').ok) ok++; });
    toast(`已发布 ${ok}/${pending.length} 项配置`, ok === pending.length ? 'success' : 'warning');
    refreshAll();
}

function exportConfigs() {
    const store = getStore();
    exportCSV(`配置台账_${new Date().toISOString().slice(0, 10)}.csv`,
        ['配置ID', '名称', '类型', '版本', '状态', '生效范围', '影响设备', '在线设备', '规则缓存', '更新时间', '参数'],
        store.configs.map(c => {
            const imp = configImpact(c);
            return [c.id, c.name, configTypeMap[c.type] || c.type, c.version, c.status, c.scope,
                imp.deviceCount, imp.onlineCount, imp.cacheKeys.join('/'), c.updateTime,
                Object.entries(c.configDetails).map(([k, v]) => `${k}=${v}`).join('; ')];
        }));
}

function refreshAll() {
    renderStats();
    applyFilters();
    renderVersionSelect();
    renderVersions();
    renderDelivery();
    renderAuditLogs();
}

// 保留原有全局入口，供其他页面或旧调用复用
window.addConfig = addConfig;
window.deleteConfig = deleteConfig;
window.showContrabandCatalog = showContrabandCatalog;
window.viewConfig = function (configId) { editConfig(configId); };

window.initConfigModule = function () {
    initTabs();
    document.getElementById('configTypeFilter').onchange = applyFilters;
    document.getElementById('configStatusFilter').onchange = applyFilters;
    document.getElementById('configNameFilter').onkeydown = (e) => { if (e.key === 'Enter') applyFilters(); };
    document.getElementById('filterBtn').onclick = applyFilters;
    document.getElementById('resetBtn').onclick = () => {
        document.getElementById('configTypeFilter').value = '';
        document.getElementById('configStatusFilter').value = '';
        document.getElementById('configNameFilter').value = '';
        applyFilters();
    };
    document.getElementById('cfgVersionConfig').onchange = (e) => { versionConfigId = e.target.value; renderVersions(); };
    document.getElementById('cfgVersionStatus').onchange = renderVersions;
    document.getElementById('cfgAuditKeyword').oninput = renderAuditLogs;
    document.getElementById('cfgAddBtn').onclick = addConfig;
    document.getElementById('cfgCatalogBtn').onclick = showContrabandCatalog;
    document.getElementById('cfgExportBtn').onclick = exportConfigs;
    document.getElementById('cfgPublishAllBtn').onclick = publishAllPending;

    refreshAll();
};
