import { getStore, addSubscription, toggleSubscription, simulateIngest } from './db.js';
import { toast, openModal, kvTableHTML, exportCSV, drawChart, paginateData, timeAgo, refreshNavBadges } from './utils.js';

let sourcePage = 1;
const perPage = 12;
let filteredSources = [];

const fmtNum = n => Number(n).toLocaleString('zh-CN');

const STATUS_TAG = { '在线': 'status-normal', '重连中': 'status-warning', '离线': 'status-danger' };

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
    const online = store.dataSources.filter(s => s.status === '在线').length;
    const rows = store.dataSources.reduce((s, x) => s + x.todayRows, 0);
    set('dcStatSources', store.dataSources.length);
    set('dcStatOnline', store.dataSources.length ? (online / store.dataSources.length * 100).toFixed(1) + '%' : '-');
    set('dcStatRows', fmtNum(rows));
    set('dcStatProtocols', new Set(store.dataSources.map(s => s.protocol)).size);
    set('dcStatLatency', Math.round(store.pipelines.reduce((s, p) => s + p.latencyMs, 0) / store.pipelines.length) + 'ms');
    set('dcStatSubs', store.subscriptions.filter(s => s.status === '启用').length);
}

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

function renderStorages(store) {
    const tbody = document.getElementById('storageTableBody');
    if (!tbody) return;
    tbody.innerHTML = store.storages.map(s => `
        <tr>
            <td>${s.id}</td>
            <td><span class="chip chip-info">${s.layer}</span></td>
            <td>${s.engine}</td>
            <td>${s.data}</td>
            <td>${s.capacity}</td>
            <td><div class="score-bar"><i style="width:${s.usedPct}%;"></i></div>${s.usedPct}%</td>
            <td>${s.retention}</td>
            <td>${s.writeRate}</td>
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

function refresh() {
    const store = getStore();
    renderStats(store);
    applyFilters();
    renderCharts();
    renderPipelines(store);
    renderStorages(store);
    renderSubscriptions(store);
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

    document.getElementById('dcNewSubBtn').onclick = showNewSubForm;
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
