import { getStore, CONTRABAND_TYPES } from './db.js';
import { toast, openModal, kvTableHTML, paginateData, fmtDateTime } from './utils.js';

// 配置类型映射
const configTypeMap = {
    device: '设备配置',
    event: '事件配置',
    system: '系统配置',
    face: '人脸/测温配置'
};

let currentConfigPage = 1;
const configsPerPage = 20;
let filteredConfigs = [];

function audit(user, action, target) {
    const store = getStore();
    store.auditLogs.unshift({ time: fmtDateTime(Date.now()), user, action, target });
    renderAuditLogs();
}

function applyFilters() {
    const store = getStore();
    const type = document.getElementById('configTypeFilter').value;
    const name = document.getElementById('configNameFilter').value.trim();
    filteredConfigs = store.configs.filter(c => {
        if (type && c.type !== type) return false;
        if (name && !c.name.includes(name)) return false;
        return true;
    });
    currentConfigPage = 1;
    renderConfigs(paginateData(filteredConfigs, currentConfigPage, configsPerPage));
    renderConfigPagination();
}

// 渲染配置列表
function renderConfigs(configs) {
    const tbody = document.getElementById('configsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    configs.forEach(config => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${config.id}</td>
            <td>${config.name}<div style="font-size:11px;color:#909399">${config.description || ''}</div></td>
            <td>${configTypeMap[config.type] || config.type}</td>
            <td>${config.scope || ''}</td>
            <td>${config.updateTime}</td>
            <td>
                <button class="btn btn-small btn-primary" data-view="${config.id}">查看/编辑</button>
                <button class="btn btn-small btn-danger" data-del="${config.id}">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => editConfig(btn.dataset.view));
    tbody.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => deleteConfig(btn.dataset.del));
}

// 查看/编辑配置（真实写回 store）
function editConfig(configId) {
    const store = getStore();
    const config = store.configs.find(c => c.id === configId);
    if (!config) return;

    const entries = Object.entries(config.configDetails);
    const formHTML = entries.map(([k, v], i) => `
        <div class="form-grid" style="margin-bottom:8px;">
            <label>${k}</label>
            <input class="form-control" data-key="${k}" value="${typeof v === 'object' ? JSON.stringify(v) : v}">
        </div>`).join('');

    openModal({
        title: `${config.name}（${config.id}）`,
        width: 560,
        bodyHTML: `
            <p style="margin-bottom:12px;color:#909399;">${config.description}｜生效范围：${config.scope}</p>
            ${formHTML}
            <p style="margin-top:10px;font-size:12px;color:#e6a23c;">修改将即时下发至相关设备并记入操作审计。</p>`,
        actions: [{
            label: '保存并下发', className: 'btn-success',
            onClick: (close, mask) => {
                const changed = [];
                mask.querySelectorAll('input[data-key]').forEach(inp => {
                    const k = inp.dataset.key;
                    let val = inp.value;
                    if (!isNaN(val) && val !== '') val = Number(val);
                    else if (val === 'true') val = true;
                    else if (val === 'false') val = false;
                    if (config.configDetails[k] !== val) {
                        config.configDetails[k] = val;
                        changed.push(`${k}: ${val}`);
                    }
                });
                if (changed.length) {
                    config.updateTime = fmtDateTime(Date.now());
                    audit(`系统管理员·${store.currentUser.name}`, `修改配置 ${config.name}：${changed.join('，')}`, config.id);
                    toast(`配置已保存并下发（${changed.length} 项变更）`, 'success');
                } else {
                    toast('未检测到变更', 'info');
                }
                close();
                applyFilters();
            }
        }]
    });
}

// 查看配置只读详情
window.viewConfig = function(configId) {
    const store = getStore();
    const config = store.configs.find(c => c.id === configId);
    if (!config) return;
    openModal({
        title: `配置详情 - ${config.name}`,
        bodyHTML: kvTableHTML([
            ['配置ID', config.id], ['类型', configTypeMap[config.type]],
            ['生效范围', config.scope], ['说明', config.description],
            ['创建时间', config.createTime], ['更新时间', config.updateTime],
            ...Object.entries(config.configDetails).map(([k, v]) => [k, String(v)])
        ])
    });
};

// 新增配置
window.addConfig = function() {
    const store = getStore();
    openModal({
        title: '新增配置',
        width: 520,
        bodyHTML: `
            <div class="form-grid">
                <label>配置名称</label><input class="form-control" id="cfgNewName" placeholder="如：5号通道液探阈值">
                <label>配置类型</label>
                <select class="form-control" id="cfgNewType">
                    <option value="device">设备配置</option><option value="event">事件配置</option>
                    <option value="system">系统配置</option><option value="face">人脸/测温配置</option>
                </select>
                <label>生效范围</label><input class="form-control" id="cfgNewScope" placeholder="设备/通道">
                <label>参数(JSON)</label><textarea class="form-control" id="cfgNewDetails" rows="3" placeholder='{"threshold": 50}'></textarea>
            </div>`,
        actions: [{
            label: '创建', className: 'btn-primary',
            onClick: (close, mask) => {
                const name = mask.querySelector('#cfgNewName').value.trim();
                if (!name) { toast('请填写配置名称', 'warning'); return; }
                let details;
                try {
                    details = JSON.parse(mask.querySelector('#cfgNewDetails').value || '{}');
                } catch (e) { toast('参数需为合法 JSON', 'error'); return; }
                const now = fmtDateTime(Date.now());
                store.configs.unshift({
                    id: `CFG-${String(100 + store.configs.length)}`,
                    name, type: mask.querySelector('#cfgNewType').value,
                    scope: mask.querySelector('#cfgNewScope').value.trim() || '全局',
                    createTime: now, updateTime: now,
                    description: '手工创建的配置项', configDetails: details
                });
                audit(`系统管理员·${store.currentUser.name}`, `新增配置 ${name}`, '系统配置');
                toast(`配置「${name}」已创建`, 'success');
                close();
                applyFilters();
            }
        }]
    });
};

// 删除配置
window.deleteConfig = function(configId) {
    const store = getStore();
    const config = store.configs.find(c => c.id === configId);
    if (!config) return;
    openModal({
        title: '删除确认', width: 430,
        bodyHTML: `<p>确定删除配置 <b style="color:#f56c6c">${config.name}</b>（${config.id}）吗？相关设备将回退默认参数。</p>`,
        actions: [{
            label: '删除', className: 'btn-danger',
            onClick: (close) => {
                store.configs = store.configs.filter(c => c.id !== configId);
                audit(`系统管理员·${store.currentUser.name}`, `删除配置 ${config.name}`, configId);
                toast('配置已删除', 'info');
                close();
                applyFilters();
            }
        }]
    });
};

// 违禁品名录（判图/交接共用字典）
window.showContrabandCatalog = function() {
    const rows = CONTRABAND_TYPES.flatMap(c => c.items.map(item => `
        <tr>
            <td>${item}</td>
            <td>${c.name}</td>
            <td><span class="chip ${c.level === 'severe' ? 'chip-danger' : 'chip-warn'}">${c.level === 'severe' ? '禁止携带' : '限制携带'}</span></td>
            <td>${c.level === 'severe' ? '一律查扣并移交民警' : '超限查扣 / 旅客自弃或寄存'}</td>
        </tr>`));
    openModal({
        title: '违禁品名录（判图辅助库 v3.5.2）',
        width: 640,
        bodyHTML: `<table class="data-table"><thead><tr><th>物品</th><th>类别</th><th>级别</th><th>处置标准</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
    });
};

// 渲染配置分页
function renderConfigPagination() {
    const tableSection = document.querySelector('#config .table-section');
    if (!tableSection) return;
    let paginationDiv = tableSection.querySelector('.pagination-page');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-page';
        tableSection.appendChild(paginationDiv);
    }
    const totalPages = Math.ceil(filteredConfigs.length / configsPerPage);
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    paginationDiv.innerHTML = `
        <button class="btn btn-secondary" ${currentConfigPage <= 1 ? 'disabled' : ''} id="cfgPrev">上一页</button>
        <span class="page-info">第 ${currentConfigPage} 页，共 ${totalPages} 页</span>
        <button class="btn btn-secondary" ${currentConfigPage >= totalPages ? 'disabled' : ''} id="cfgNext">下一页</button>
    `;
    document.getElementById('cfgPrev').onclick = () => { currentConfigPage--; renderConfigs(paginateData(filteredConfigs, currentConfigPage, configsPerPage)); renderConfigPagination(); };
    document.getElementById('cfgNext').onclick = () => { currentConfigPage++; renderConfigs(paginateData(filteredConfigs, currentConfigPage, configsPerPage)); renderConfigPagination(); };
}

// 操作审计
function renderAuditLogs() {
    const store = getStore();
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    tbody.innerHTML = store.auditLogs.slice(0, 20).map(l => `
        <tr><td>${l.time}</td><td>${l.user}</td><td>${l.action}</td><td>${l.target}</td></tr>`).join('');
}

// 全局初始化函数
window.initConfigModule = function() {
    document.getElementById('configTypeFilter').onchange = applyFilters;
    document.getElementById('configNameFilter').onkeydown = (e) => { if (e.key === 'Enter') applyFilters(); };
    document.getElementById('filterBtn').onclick = applyFilters;
    document.getElementById('resetBtn').onclick = () => {
        document.getElementById('configTypeFilter').value = '';
        document.getElementById('configNameFilter').value = '';
        applyFilters();
    };
    applyFilters();
    renderAuditLogs();
};
