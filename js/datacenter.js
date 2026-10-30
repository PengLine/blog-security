import {
    getStore, addSubscription, toggleSubscription, simulateIngest, runQualityCheck,
    DC_LAYERS, DC_DOMAINS, DC_TECH_STACK, DC_CAPACITY, DC_SECURITY_LEVELS
} from './db.js';
import { toast, openModal, kvTableHTML, exportCSV, drawChart, paginateData, timeAgo, refreshNavBadges } from './utils.js';

let sourcePage = 1;
const perPage = 12;
let filteredSources = [];

const fmtNum = n => Number(n).toLocaleString('zh-CN');

const STATUS_TAG = { '在线': 'status-normal', '重连中': 'status-warning', '离线': 'status-danger' };

// 数仓分层元信息：ODS 贴源 → DWD 明细 → DWS 汇总 → ADS 应用
const LAYER_META = {
    ODS: { name: 'ODS 原始层', desc: '贴源接入，保留原始报文', color: '#409eff' },
    DWD: { name: 'DWD 明细层', desc: '清洗标准化后的业务明细', color: '#67c23a' },
    DWS: { name: 'DWS 汇总层', desc: '按主题与时间粒度轻聚合', color: '#e6a23c' },
    ADS: { name: 'ADS 应用层', desc: '面向场景的指标与应用表', color: '#f56c6c' }
};

// 架构设计原则：解释“为什么这样分层”
const PRINCIPLES = [
    { t: '分层解耦', d: '采集 / 处理 / 存储 / 服务职责单一，新增设备协议只改接入层' },
    { t: '主题域建模', d: '按旅客、包裹、图像、设备、告警、运营划分主题域，指标口径统一' },
    { t: '流批一体', d: '实时链路与离线补数共用同一套表模型与 SQL，避免双套口径' },
    { t: '湖仓分层', d: 'ODS → DWD → DWS → ADS 逐层收敛，任一指标可追溯到原始报文' },
    { t: '服务化共享', d: '消费方只通过数据服务与订阅取数，禁止直连库表，便于限流与审计' },
    { t: '治理内建', d: '质量规则、血缘、分级脱敏随链路自动采集，不做事后补录' }
];

function initTabs() {
    const navs = document.querySelectorAll('#datacenter .tab-nav-item');
    const contents = document.querySelectorAll('#datacenter .tab-content');
    navs.forEach(item => {
        item.onclick = () => {
            navs.forEach(n => n.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            item.classList.add('active');
            const target = document.getElementById(item.dataset.tab);
            if (target) target.classList.add('active');
            // 图表容器在隐藏状态下宽度为 0，切回采集页时重绘
            if (item.dataset.tab === 'collect') renderCharts();
        };
    });
}

function renderStats(store) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const rows = store.dataSources.reduce((s, x) => s + x.todayRows, 0);
    const quality = store.qualityRules.reduce((s, r) => s + r.passRate, 0) / store.qualityRules.length;
    set('dcStatDomains', DC_DOMAINS.length);
    set('dcStatSources', store.dataSources.length);
    set('dcStatRows', fmtNum(rows));
    set('dcStatTables', store.warehouseTables.length);
    set('dcStatServices', store.dataServices.length);
    set('dcStatQuality', quality.toFixed(2) + '%');
}

// ---------- 架构总览：六层架构 + 主题域 + 技术选型 ----------
function renderArch() {
    const wrap = document.getElementById('dcArch');
    if (!wrap) return;
    wrap.innerHTML = DC_LAYERS.map((l, i) => `
        <div class="arch-layer">
            <div class="arch-layer-name">
                <span class="arch-index">L${i + 1}</span>
                <b>${l.name}</b>
                <small>${l.sub}</small>
            </div>
            <div class="arch-layer-body">
                <div class="arch-chips">${l.items.map(x => `<span class="arch-chip">${x}</span>`).join('')}</div>
                <div class="arch-meta"><span>${l.standard}</span><span class="arch-note">${l.note}</span></div>
            </div>
        </div>
        ${i < DC_LAYERS.length - 1 ? '<div class="arch-arrow">↓</div>' : ''}`).join('');
}

function renderDomains(store) {
    const principles = document.getElementById('dcPrinciples');
    if (principles) {
        principles.innerHTML = PRINCIPLES.map(p => `
            <div class="principle-card">
                <b>${p.t}</b>
                <small>${p.d}</small>
            </div>`).join('');
    }

    const wrap = document.getElementById('dcDomains');
    if (!wrap) return;
    wrap.innerHTML = DC_DOMAINS.map(d => {
        const owned = store.warehouseTables.filter(t => t.domain === d.name).length;
        return `
            <div class="domain-card">
                <div class="domain-head"><b>${d.name}</b><span class="chip chip-info">${owned} 张表</span></div>
                <div class="domain-entity">${d.entities}</div>
                <div class="domain-tables">${d.tables.map(t => `<span class="arch-chip">${t}</span>`).join('')}</div>
                <div class="domain-owner">责任人：${d.owner}</div>
            </div>`;
    }).join('');
}

function renderTechStack() {
    const tbody = document.getElementById('dcTechBody');
    if (!tbody) return;
    tbody.innerHTML = DC_TECH_STACK.map(t => `
        <tr>
            <td><b>${t.component}</b></td>
            <td>${t.role}</td>
            <td style="font-size:12px;color:#c0c4cc;">${t.spec}</td>
            <td style="font-size:12px;color:#909399;">${t.ha}</td>
        </tr>`).join('');
}

// ---------- 采集接入 ----------
function renderCharts() {
    const collect = document.getElementById('collect');
    if (!collect || !collect.classList.contains('active')) return;
    const store = getStore();

    const protoCount = {};
    store.dataSources.forEach(s => { protoCount[s.protocol] = (protoCount[s.protocol] || 0) + 1; });
    const protoLabels = Object.keys(protoCount);
    drawChart('dcProtocolChart', '协议接入分布（设备数）', protoLabels.map(k => protoCount[k]), protoLabels,
        ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#722ed1', '#36cfc9', '#ff9f7f', '#909399']);

    const statusCount = { '在线': 0, '重连中': 0, '离线': 0 };
    store.dataSources.forEach(s => { statusCount[s.status] += 1; });
    drawChart('dcStatusChart', '采集状态分布', [statusCount['在线'], statusCount['重连中'], statusCount['离线']],
        ['在线', '重连中', '离线'], ['#67c23a', '#e6a23c', '#f56c6c']);
}

function applyFilters() {
    const store = getStore();
    const proto = document.getElementById('dcProtocolFilter').value;
    const status = document.getElementById('dcStatusFilter').value;
    const kw = document.getElementById('dcKeyword').value.trim();
    filteredSources = store.dataSources.filter(s => {
        if (proto && s.protocol !== proto) return false;
        if (status && s.status !== status) return false;
        if (kw && !(s.deviceName + s.displayName + s.endpoint + s.topic).includes(kw)) return false;
        return true;
    });
    sourcePage = 1;
    renderSources();
}

function renderSources() {
    const tbody = document.getElementById('dcSourceBody');
    const stat = document.getElementById('dcSourceStat');
    if (!tbody) return;
    if (stat) stat.textContent = `接入源 ${filteredSources.length} / ${getStore().dataSources.length} 个`;

    const rows = paginateData(filteredSources, sourcePage, perPage);
    tbody.innerHTML = rows.map(s => {
        const latency = s.status === '离线' ? '—'
            : `<span style="color:${s.latencyMs > 120 ? '#f56c6c' : s.latencyMs > 60 ? '#e6a23c' : '#67c23a'};">${s.latencyMs}ms</span>`;
        return `<tr>
            <td>${s.id}</td>
            <td>${s.deviceName}<div style="font-size:11px;color:#909399;">${s.channel} · ${s.displayName}</div></td>
            <td>${s.category}</td>
            <td><span class="chip chip-info">${s.protocol}</span></td>
            <td>${s.endpoint}</td>
            <td style="font-size:12px;color:#909399;">${s.topic}</td>
            <td>${s.freq}s</td>
            <td><span class="status-tag ${STATUS_TAG[s.status]}">${s.status}</span></td>
            <td>${fmtNum(s.todayRows)}</td>
            <td>${latency}</td>
            <td>${s.status === '离线' ? '—' : timeAgo(s.lastHeartbeat)}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="11" style="text-align:center;color:#909399;">无匹配接入源</td></tr>';

    const pag = document.getElementById('dcSourcePagination');
    if (!pag) return;
    const totalPages = Math.ceil(filteredSources.length / perPage);
    pag.innerHTML = totalPages <= 1 ? '' : `
        <button class="btn btn-secondary" ${sourcePage <= 1 ? 'disabled' : ''} id="dcPrev">上一页</button>
        <span class="page-info">第 ${sourcePage} 页，共 ${totalPages} 页</span>
        <button class="btn btn-secondary" ${sourcePage >= totalPages ? 'disabled' : ''} id="dcNext">下一页</button>`;
    if (totalPages > 1) {
        document.getElementById('dcPrev').onclick = () => { sourcePage--; renderSources(); };
        document.getElementById('dcNext').onclick = () => { sourcePage++; renderSources(); };
    }
}

// ---------- 链路处理 ----------
function renderPipelines(store) {
    const wrap = document.getElementById('pipeCards');
    if (wrap) {
        wrap.innerHTML = store.pipelines.map(p => `
            <div class="pipe-card">
                <div class="pipe-head">
                    <div><b>${p.id} ${p.name}</b> <span class="chip chip-info">${p.mode}</span></div>
                    <div style="font-size:12px;color:#909399;">
                        ${p.source} · ${p.protocol} · ${p.topic} · 今日 ${fmtNum(p.todayRows)} 条 · 端到端 ${p.latencyMs}ms
                    </div>
                </div>
                <div class="pipe-stages">
                    ${p.stages.map((st, i) => `
                        <span class="pipe-stage">${st.name}<small>${st.latencyMs}ms · ${st.qps} qps${st.errors ? ` · 异常 ${st.errors}` : ''}</small></span>
                        ${i < p.stages.length - 1 ? '<span class="pipe-arrow">→</span>' : ''}`).join('')}
                </div>
            </div>`).join('');
    }

    const tbody = document.getElementById('pipeTableBody');
    if (!tbody) return;
    tbody.innerHTML = store.pipelines.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${p.name}</td>
            <td>${p.source}</td>
            <td>${p.protocol}</td>
            <td style="font-size:12px;color:#909399;">${p.topic}</td>
            <td>${fmtNum(p.todayRows)}</td>
            <td>${p.latencyMs}ms</td>
            <td>${p.backlog}</td>
            <td><span class="status-tag status-normal">${p.status}</span></td>
            <td><button class="btn btn-secondary" data-pipe="${p.id}">查看</button></td>
        </tr>`).join('');

    tbody.querySelectorAll('[data-pipe]').forEach(btn => btn.onclick = () => {
        const p = getStore().pipelines.find(x => x.id === btn.dataset.pipe);
        if (!p) return;
        openModal({
            title: `链路详情 - ${p.id}`,
            width: 620,
            bodyHTML: `
                ${kvTableHTML([
                    ['链路名称', p.name], ['数据源', p.source], ['协议链路', p.protocol],
                    ['主题', p.topic], ['今日流量', `${fmtNum(p.todayRows)} 条`],
                    ['端到端时延', `${p.latencyMs}ms`], ['积压', `${p.backlog} 条`], ['状态', p.status]
                ])}
                <div class="sub-title">阶段明细</div>
                <table class="data-table">
                    <thead><tr><th>阶段</th><th>时延</th><th>吞吐</th><th>异常数</th></tr></thead>
                    <tbody>${p.stages.map(s => `<tr><td>${s.name}</td><td>${s.latencyMs}ms</td><td>${s.qps} qps</td><td>${s.errors}</td></tr>`).join('')}</tbody>
                </table>`
        });
    });
}

// ---------- 数据资产：分层统计 + 表清单 + 血缘 ----------
function renderLayerStats(store) {
    const wrap = document.getElementById('dcLayerStats');
    if (!wrap) return;
    wrap.innerHTML = Object.keys(LAYER_META).map(layer => {
        const meta = LAYER_META[layer];
        const list = store.warehouseTables.filter(t => t.layer === layer);
        const rows = list.reduce((s, t) => s + t.rows, 0);
        return `
            <div class="layer-stat">
                <span class="layer-tag" style="color:${meta.color};border-color:${meta.color};">${layer}</span>
                <b>${list.length} 张表</b>
                <div class="layer-rows">${fmtNum(rows)} 行</div>
                <small>${meta.desc}</small>
            </div>`;
    }).join('');
}

function renderAssets(store) {
    renderLayerStats(store);
    const layer = document.getElementById('dcLayerFilter').value;
    const domain = document.getElementById('dcDomainFilter').value;
    const list = store.warehouseTables.filter(t => (!layer || t.layer === layer) && (!domain || t.domain === domain));
    const stat = document.getElementById('dcAssetStat');
    if (stat) stat.textContent = `表 ${list.length} / ${store.warehouseTables.length} 张`;

    const tbody = document.getElementById('dcTableBody');
    if (!tbody) return;
    tbody.innerHTML = list.map(t => `
        <tr>
            <td>${t.id}</td>
            <td><b style="color:#e6f2ff;">${t.table}</b><div style="font-size:11px;color:#909399;">${t.cn}</div></td>
            <td><span class="chip chip-info">${t.layer}</span></td>
            <td>${t.domain}</td>
            <td>${fmtNum(t.rows)}</td>
            <td style="font-size:12px;color:#67c23a;">${t.growth}</td>
            <td>${t.update}</td>
            <td style="font-size:12px;color:#909399;">${t.partition}</td>
            <td>${t.owner}</td>
            <td><button class="btn btn-secondary" data-lineage="${t.table}">血缘</button></td>
        </tr>`).join('') || '<tr><td colspan="10" style="text-align:center;color:#909399;">无匹配数据表</td></tr>';

    tbody.querySelectorAll('[data-lineage]').forEach(btn => btn.onclick = () => showLineage(btn.dataset.lineage));
}

// 血缘链路：上游 → 当前表 → 下游表 / 数据服务
function showLineage(tableName) {
    const store = getStore();
    const t = store.warehouseTables.find(x => x.table === tableName);
    if (!t) return;
    const services = store.dataServices.filter(s => s.source === t.table);
    openModal({
        title: `数据血缘 - ${t.table}`,
        width: 720,
        bodyHTML: `
            <div class="lineage">
                <div class="lineage-col">
                    <div class="lineage-title">上游来源</div>
                    ${t.up.map(u => `<span class="arch-chip">${u}</span>`).join('')}
                </div>
                <div class="lineage-arrow">→</div>
                <div class="lineage-col current">
                    <div class="lineage-title">当前表 · ${t.layer}</div>
                    <span class="arch-chip arch-chip-main">${t.table}</span>
                    <small>${t.cn} · ${t.domain} · ${fmtNum(t.rows)} 行</small>
                </div>
                <div class="lineage-arrow">→</div>
                <div class="lineage-col">
                    <div class="lineage-title">下游 / 服务</div>
                    ${t.down.map(d => `<span class="arch-chip">${d}</span>`).join('')}
                    ${services.map(s => `<span class="arch-chip arch-chip-svc">${s.name}</span>`).join('')}
                </div>
            </div>
            ${kvTableHTML([
                ['更新频率', t.update], ['分区键', t.partition], ['日增量', t.growth],
                ['保留与生命周期', `${LAYER_META[t.layer].name} · 按天分区滚动归档`], ['责任人', t.owner]
            ])}`,
        actions: [{
            label: '前往质量规则', className: 'btn-primary',
            onClick: (close) => {
                close();
                const tab = document.querySelector('#datacenter .tab-nav-item[data-tab="govern"]');
                if (tab) tab.click();
            }
        }]
    });
}

// ---------- 服务订阅 ----------
function renderServices(store) {
    const tbody = document.getElementById('dcServiceBody');
    if (!tbody) return;
    tbody.innerHTML = store.dataServices.map(s => `
        <tr>
            <td>${s.id}</td>
            <td><b style="color:#e6f2ff;">${s.name}</b></td>
            <td style="font-size:12px;color:#909399;">${s.path}</td>
            <td><span class="chip chip-info">${s.method}</span></td>
            <td>${s.domain}</td>
            <td style="font-size:12px;color:#909399;">${s.source}</td>
            <td style="font-size:12px;">${s.consumer}</td>
            <td>${s.qps}</td>
            <td>${s.p99}</td>
            <td>${s.sla}</td>
            <td style="font-size:12px;color:#909399;">${s.auth}</td>
            <td><span class="status-tag status-normal">${s.status}</span></td>
        </tr>`).join('');
}

function renderSubscriptions(store) {
    const tbody = document.getElementById('dcSubBody');
    if (!tbody) return;
    const stat = document.getElementById('dcSubStat');
    if (stat) stat.textContent = `订阅 ${store.subscriptions.length} 个，启用 ${store.subscriptions.filter(s => s.status === '启用').length} 个`;

    tbody.innerHTML = store.subscriptions.map(s => `
        <tr>
            <td>${s.id}</td>
            <td>${s.subscriber}</td>
            <td style="font-size:12px;color:#909399;">${s.topic}</td>
            <td>${s.protocol}</td>
            <td style="font-size:12px;color:#909399;">${s.desc || '-'}</td>
            <td>${fmtNum(s.todayCount)}</td>
            <td>${s.qps}</td>
            <td>${s.lastPush}</td>
            <td><span class="status-tag ${s.status === '启用' ? 'status-normal' : 'status-danger'}">${s.status}</span></td>
            <td><button class="btn ${s.status === '启用' ? 'btn-danger' : 'btn-success'}" data-toggle="${s.id}">${s.status === '启用' ? '停用' : '启用'}</button></td>
        </tr>`).join('');

    tbody.querySelectorAll('[data-toggle]').forEach(btn => btn.onclick = () => {
        const item = toggleSubscription(btn.dataset.toggle);
        if (item) {
            toast(`订阅 ${item.id}（${item.subscriber}）已${item.status}`, 'info');
            refresh();
        }
    });
}

function showNewSubForm() {
    const store = getStore();
    const topics = [...new Set(store.pipelines.map(p => p.topic).concat(['alarm/created', 'event/log', 'agg/metrics.5m', 'dashboard/realtime']))];
    openModal({
        title: '新建数据订阅',
        width: 560,
        bodyHTML: `
            <div class="form-grid">
                <label>订阅方</label><input class="form-control" id="dcSubName" placeholder="如：安检质控平台">
                <label>订阅主题</label>
                <select class="form-control" id="dcSubTopic">${topics.map(t => `<option>${t}</option>`).join('')}</select>
                <label>推送方式</label>
                <select class="form-control" id="dcSubProtocol">
                    <option>MQTT 订阅</option><option>Kafka 消费组</option>
                    <option>HTTP 回调</option><option>WebSocket 推送</option>
                </select>
                <label>用途说明</label><textarea class="form-control" id="dcSubDesc" rows="2" placeholder="描述该订阅承载的业务场景"></textarea>
            </div>
            <p style="margin-top:10px;font-size:12px;color:#909399;">创建后订阅默认启用，可在列表中随时停用；同一订阅方不可重复订阅同一主题。</p>`,
        actions: [{
            label: '创建订阅', className: 'btn-success',
            onClick: (close, mask) => {
                const r = addSubscription({
                    subscriber: mask.querySelector('#dcSubName').value.trim(),
                    topic: mask.querySelector('#dcSubTopic').value,
                    protocol: mask.querySelector('#dcSubProtocol').value,
                    desc: mask.querySelector('#dcSubDesc').value.trim()
                });
                if (r.ok) { toast(`订阅 ${r.item.id} 已创建并启用`, 'success'); close(); refresh(); }
                else toast(r.msg, 'error');
            }
        }]
    });
}

// ---------- 治理运维 ----------
function renderQuality(store) {
    const tbody = document.getElementById('dcQualityBody');
    const stat = document.getElementById('dcQualityStat');
    if (stat) {
        const warn = store.qualityRules.filter(r => r.status === '预警').length;
        stat.textContent = `规则 ${store.qualityRules.length} 条 · 预警 ${warn} 条`;
    }
    if (!tbody) return;
    tbody.innerHTML = store.qualityRules.map(r => `
        <tr>
            <td>${r.id}</td>
            <td>${r.name}</td>
            <td style="font-size:12px;color:#909399;">${r.target}</td>
            <td><span class="chip chip-info">${r.type}</span></td>
            <td style="color:${r.passRate >= r.threshold ? '#67c23a' : '#f56c6c'};"><b>${r.passRate.toFixed(2)}%</b></td>
            <td style="font-size:12px;color:#909399;">${r.threshold}%</td>
            <td style="font-size:12px;color:#909399;">${r.checkedAt}</td>
            <td><span class="status-tag ${r.status === '通过' ? 'status-normal' : 'status-warning'}">${r.status}</span></td>
            <td>${r.owner}</td>
        </tr>`).join('');
}

function renderGovernance(store) {
    renderQuality(store);

    const cap = document.getElementById('dcCapacity');
    if (cap) {
        cap.innerHTML = DC_CAPACITY.map(c => `
            <div class="cap-card">
                <div class="cap-name">${c.name}</div>
                <div class="cap-value">${c.value}</div>
                <div class="score-bar"><i style="width:${c.pct}%;"></i></div>
            </div>`).join('');
    }

    const security = document.getElementById('dcSecurityBody');
    if (security) {
        security.innerHTML = DC_SECURITY_LEVELS.map(s => `
            <tr>
                <td><span class="chip ${s.level.startsWith('L4') ? 'chip-danger' : 'chip-info'}">${s.level}</span></td>
                <td>${s.scope}</td>
                <td style="font-size:12px;color:#909399;">${s.policy}</td>
            </tr>`).join('');
    }

    const audit = document.getElementById('dcAuditBody');
    if (audit) {
        audit.innerHTML = store.auditLogs.slice(0, 8).map(a => `
            <tr>
                <td style="font-size:12px;color:#909399;">${a.time}</td>
                <td>${a.user}</td>
                <td>${a.action}</td>
                <td style="font-size:12px;color:#909399;">${a.target || '-'}</td>
            </tr>`).join('');
    }
}

function refresh() {
    const store = getStore();
    renderStats(store);
    renderArch();
    renderDomains(store);
    renderTechStack();
    applyFilters();
    renderCharts();
    renderPipelines(store);
    renderAssets(store);
    renderServices(store);
    renderSubscriptions(store);
    renderGovernance(store);
    refreshNavBadges();
}

window.initDatacenterModule = function() {
    const store = getStore();
    initTabs();

    const protoSel = document.getElementById('dcProtocolFilter');
    if (protoSel) {
        protoSel.innerHTML = '<option value="">全部</option>' +
            [...new Set(store.dataSources.map(s => s.protocol))].map(p => `<option>${p}</option>`).join('');
        protoSel.onchange = applyFilters;
    }
    const statusSel = document.getElementById('dcStatusFilter');
    if (statusSel) statusSel.onchange = applyFilters;
    const kw = document.getElementById('dcKeyword');
    if (kw) kw.onkeydown = (e) => { if (e.key === 'Enter') applyFilters(); };

    const domainSel = document.getElementById('dcDomainFilter');
    if (domainSel) {
        domainSel.innerHTML = '<option value="">全部</option>' + DC_DOMAINS.map(d => `<option>${d.name}</option>`).join('');
        domainSel.onchange = () => renderAssets(getStore());
    }
    const layerSel = document.getElementById('dcLayerFilter');
    if (layerSel) layerSel.onchange = () => renderAssets(getStore());

    document.getElementById('dcNewSubBtn').onclick = showNewSubForm;
    document.getElementById('dcQualityBtn').onclick = () => {
        const r = runQualityCheck('数据中台·质量调度');
        toast(`质量巡检完成：${r.pass} 项通过，${r.warn} 项预警`, r.warn ? 'warning' : 'success');
        refresh();
    };
    document.getElementById('dcIngestBtn').onclick = () => {
        const rows = simulateIngest();
        toast(`本轮模拟设备上报完成，新增采集 ${fmtNum(rows)} 条，已分发至启用中的订阅方`, 'success');
        refresh();
    };
    document.getElementById('dcExportBtn').onclick = () => {
        exportCSV(`数据接入台账_${new Date().toISOString().slice(0, 10)}.csv`,
            ['接入编号', '设备', '类别', '协议', '端点', '主题', '频率(秒)', '状态', '今日条数', '时延(ms)'],
            getStore().dataSources.map(s => [s.id, s.deviceName, s.category, s.protocol, s.endpoint, s.topic, s.freq, s.status, s.todayRows, s.latencyMs]));
    };

    refresh();
};
