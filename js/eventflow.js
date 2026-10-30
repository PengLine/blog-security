import {
    getStore, runEventTick, ingestDeviceEvent, eventEngineStats, EVENT_RULES, EVENT_SITE
} from './db.js';
import {
    toast, openModal, kvTableHTML, exportCSV, timeAgo, paginateData, refreshNavBadges
} from './utils.js';

let currentPage = 1;
const perPage = 15;
let filteredEvents = [];

const LEVEL_META = {
    danger: { name: '危险', cls: 'status-danger' },
    warning: { name: '警告', cls: 'status-warning' },
    info: { name: '正常', cls: 'status-normal' }
};

const STATUS_CLS = { '待处理': 'status-warning', '已处理': 'status-normal', '已丢弃': 'status-danger' };

// 设备类别 → 上报事件（覆盖矩阵）
const COVERAGE = [
    { cat: '安检机 / 分析仪', source: '安检机', desc: '包裹事件：双视角绑定 10s 合并违禁品 + 人脸事件绑定 + 集中判图/本地判图', by: '集中判图 / 本地告警中心' },
    { cat: '安检门', source: '安检门', desc: '客流事件（进/出）、金属事件（金属值、绝对值正常/异常、增量、负值、未刷脸、未注册）', by: '本地告警中心' },
    { cat: '分类门', source: '分类门', desc: '违禁品检出（名称 + 数量 + 位置），兼具客流统计', by: '本地告警中心' },
    { cat: '明眸 / 抓拍机', source: '明眸', desc: '人脸识别 + 温度感应，客流预警与过温人数统计', by: '本地告警中心' },
    { cat: '炸探', source: '炸探', desc: '爆炸物痕量检出（TNT / 硝酸铵 / 黑火药）', by: '本地告警中心' },
    { cat: '液探', source: '液探', desc: '可燃物液体检出（汽油 / 酒精 / 香蕉水）', by: '本地告警中心' },
    { cat: '姿态识别', source: '姿态', desc: '离岗事件（时间差超配置）+ 瞌睡/聊天/抽烟/打电话/遮挡行为', by: '本地告警中心' }
];

function initTabs() {
    const navs = document.querySelectorAll('#eventflow .tab-nav-item');
    const contents = document.querySelectorAll('#eventflow .tab-content');
    navs.forEach(item => {
        item.onclick = () => {
            navs.forEach(n => n.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            item.classList.add('active');
            const target = document.getElementById(item.dataset.tab);
            if (target) target.classList.add('active');
            if (item.dataset.tab === 'binding') renderBinding();
            if (item.dataset.tab === 'situation') renderSituation();
        };
    });
}

function renderStats(store) {
    const s = eventEngineStats(store);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('evStatRaw', s.total);
    set('evStatEnriched', s.enriched);
    set('evStatMerged', `${s.merged}`);
    set('evStatFace', s.faceBound);
    set('evStatJudge', s.central + s.local);
    set('evStatPending', `${s.pending} / ${s.dropped}`);
}

function renderStages(store) {
    const s = eventEngineStats(store);
    const box = document.getElementById('evtStages');
    if (!box) return;
    const stages = [
        { i: '01', name: '设备上报', num: s.total, desc: '安检机 / 安检门 / 分类门 / 明眸 / 炸探 / 液探 / 姿态' },
        { i: '02', name: '缓存富化', num: s.enriched, desc: 'rule:* TTL 300s → 告警等级；dev:* TTL 600s → 站点通道' },
        { i: '03', name: '双视角绑定', num: s.merged, desc: `10s 窗口合并 ${s.merged}｜DB 回查命中 ${s.dbHit}｜单视角 ${s.singleView}` },
        { i: '04', name: '人脸绑定', num: s.faceBound, desc: `6s × 20 次命中 ${s.faceBound}｜2 分钟超时丢弃 ${s.faceDropped}` },
        { i: '05', name: '判图分流', num: s.central + s.local, desc: `集中判图 ${s.central}｜本地判图 ${s.local}` },
        { i: '06', name: '事件落地', num: s.total - s.pending - s.dropped, desc: `转违禁事件 ${s.contraband}｜待处理 ${s.pending}｜丢弃 ${s.dropped}` }
    ];
    box.innerHTML = stages.map(st => `
        <div class="stage-card">
            <span class="st-index">STAGE ${st.i}</span>
            <b>${st.name}</b>
            <div class="st-num">${st.num}</div>
            <small>${st.desc}</small>
        </div>`).join('');
}

function renderClock(store) {
    const el = document.getElementById('evtClock');
    if (el) el.textContent = `+${Math.round(store.eventEngine.clock / 1000)}s`;
}

function renderLogs(store) {
    const tbody = document.getElementById('evtLogBody');
    if (!tbody) return;
    const logs = store.auditLogs
        .filter(l => l.target === 'EVENT-ENGINE' || l.target === 'EVENT-GATEWAY' || /^EV-/.test(l.target))
        .slice(0, 14);
    tbody.innerHTML = logs.length ? logs.map(l => `
        <tr>
            <td>${l.time}</td>
            <td>${l.user}</td>
            <td>${l.action}</td>
            <td>${l.target}</td>
        </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:#909399;">暂无处理日志</td></tr>';
}

function fmtRemain(ms) {
    if (ms <= 0) return '<span style="color:#f56c6c;">已超时</span>';
    return `${(ms / 1000).toFixed(1)}s`;
}

function renderBinding(store) {
    const eng = store.eventEngine;
    const virtualNow = Date.now() + eng.clock;

    const vcBody = document.getElementById('evtViewCacheBody');
    if (vcBody) {
        vcBody.innerHTML = eng.viewCache.length ? eng.viewCache.map(v => `
            <tr>
                <td>${v.key}</td>
                <td>${v.channel}</td>
                <td>${v.viewId}</td>
                <td>${v.eventId}</td>
                <td><span class="status-tag ${v.status === '等待第一视角' ? 'status-warning' : 'status-normal'}">${v.status}</span></td>
                <td>${(v.expireAt - virtualNow) > 0 ? '+10s 内有效' : '已过期清理'}</td>
            </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#909399;">暂无视角缓存</td></tr>';
    }

    const dqBody = document.getElementById('evtDelayBody');
    if (dqBody) {
        dqBody.innerHTML = eng.delayQueue.length ? eng.delayQueue.map(q => `
            <tr>
                <td>${q.id}</td>
                <td>${q.eventId}</td>
                <td>${q.channel}</td>
                <td>${q.viewId}</td>
                <td>${q.dbHasView1 ? '是' : '否'}</td>
                <td>${fmtRemain(q.expireAt - virtualNow)}</td>
                <td><span class="status-tag ${q.status === '等待中' ? 'status-warning' : (q.status === '已过期' ? 'status-normal' : 'status-danger')}">${q.status}</span></td>
                <td>${q.result || '—'}</td>
            </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:#909399;">暂无延迟队列</td></tr>';
    }

    const fqBody = document.getElementById('evtFaceBody');
    if (fqBody) {
        fqBody.innerHTML = eng.faceQueue.length ? eng.faceQueue.map(q => {
            const e = eng.rawEvents.find(x => x.id === q.eventId);
            const remain = q.nextPollAt - virtualNow;
            return `
            <tr>
                <td>${q.id}</td>
                <td>${q.eventId}</td>
                <td>${q.bagId}</td>
                <td>${q.passengerId}</td>
                <td>${q.attempts} / ${q.maxAttempts}</td>
                <td>${q.status === '轮询中' ? fmtRemain(remain) : '—'}</td>
                <td><span class="status-tag ${q.status === '轮询中' ? 'status-warning' : (q.status === '已绑定' ? 'status-normal' : 'status-danger')}">${q.status}</span></td>
                <td>${(e && e.binding.face.eventId) || '—'}</td>
            </tr>`;
        }).join('') : '<tr><td colspan="8" style="text-align:center;color:#909399;">暂无人脸轮询任务</td></tr>';
    }
}

function applyFilters() {
    const store = getStore();
    const eng = store.eventEngine;
    const source = document.getElementById('evtSourceFilter').value;
    const level = document.getElementById('evtLevelFilter').value;
    const status = document.getElementById('evtStatusFilter').value;
    const keyword = document.getElementById('evtKeyword').value.trim();

    filteredEvents = eng.rawEvents.filter(e => {
        if (source && e.source !== source) return false;
        if (level && e.level !== level) return false;
        if (status && e.status !== status) return false;
        if (keyword) {
            const hay = [e.id, e.deviceName, e.channel, e.channelName, e.type, e.payload.bagId, e.payload.passengerName, e.payload.employee]
                .filter(Boolean).join(' ');
            if (!hay.includes(keyword)) return false;
        }
        return true;
    });
    currentPage = 1;

    const stat = document.getElementById('evtEventStat');
    if (stat) stat.textContent = `共 ${filteredEvents.length} 条 / 全部 ${eng.rawEvents.length} 条`;

    renderEvents(paginateData(filteredEvents, currentPage, perPage));
    renderPagination();
}

function renderEvents(rows) {
    const tbody = document.getElementById('evtRawBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#909399;">没有符合条件的事件</td></tr>';
        return;
    }
    rows.forEach(e => {
        const lv = LEVEL_META[e.level] || LEVEL_META.info;
        const bind = e.source === '安检机'
            ? `视角：${e.binding.view.status}<div style="font-size:11px;color:#909399;">人脸：${e.binding.face.status}</div>`
            : `<span style="color:#909399;">${e.binding.face.status === '不适用' ? '不涉及绑定' : e.binding.face.status}</span>`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${e.id}<div style="font-size:11px;color:#909399;">${timeAgo(e.ts)}</div></td>
            <td>${e.time}</td>
            <td>${e.source}</td>
            <td>${e.deviceName}<div style="font-size:11px;color:#909399;">${e.deviceId}</div></td>
            <td>${e.site}<div style="font-size:11px;color:#909399;">${e.channel} / ${e.channelName}</div></td>
            <td>${e.type}</td>
            <td><span class="status-tag ${lv.cls}">${lv.name}</span></td>
            <td>${bind}</td>
            <td>${e.judge.mode}<div style="font-size:11px;color:#909399;">${e.judge.result || '待判图'}</div></td>
            <td><span class="status-tag ${STATUS_CLS[e.status] || 'status-normal'}">${e.status}</span></td>
            <td><button class="btn btn-primary" data-view="${e.id}">详情</button></td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-view]').forEach(btn => {
        btn.onclick = () => {
            const evt = getStore().eventEngine.rawEvents.find(e => e.id === btn.dataset.view);
            if (evt) showEventDetail(evt);
        };
    });
}

function renderPagination() {
    const moduleDiv = document.getElementById('eventflow');
    const tableSection = moduleDiv && moduleDiv.querySelector('#events .table-section');
    if (!tableSection) return;

    let box = tableSection.querySelector('.pagination-page');
    if (!box) {
        box = document.createElement('div');
        box.className = 'pagination-page';
        tableSection.appendChild(box);
    }
    const totalPages = Math.ceil(filteredEvents.length / perPage);
    if (totalPages <= 1) { box.innerHTML = ''; return; }

    box.innerHTML = `
        <button class="btn btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} id="evtPrev">上一页</button>
        <span class="page-info">第 ${currentPage} 页，共 ${totalPages} 页（${filteredEvents.length} 条）</span>
        <button class="btn btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} id="evtNext">下一页</button>
    `;
    document.getElementById('evtPrev').onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            renderEvents(paginateData(filteredEvents, currentPage, perPage));
            renderPagination();
        }
    };
    document.getElementById('evtNext').onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderEvents(paginateData(filteredEvents, currentPage, perPage));
            renderPagination();
        }
    };
}

// 按来源组织事件载荷，详情弹窗按业务字段展开
function payloadRows(e) {
    const p = e.payload || {};
    const rows = [];
    if (e.source === '安检机') {
        rows.push(['包裹', `${p.bagId || '-'}（${p.weightKg || '-'}kg）`]);
        rows.push(['旅客', `${p.passengerName || '-'} / ${p.passengerId || '-'}`]);
        rows.push(['视角', `${p.view1 || '-'} + ${p.view2 || '-'}（间隔 ${p.deltaMs ? (p.deltaMs / 1000).toFixed(1) + 's' : '-'}）`]);
        rows.push(['违禁品', (p.contraband && p.contraband.length)
            ? p.contraband.map(c => `${c.name} × ${c.qty || 1}`).join('、') : '无']);
    } else if (e.source === '安检门' && e.typeKey.startsWith('metal')) {
        rows.push(['金属值 / 阈值', `${p.metalValue} / ${p.threshold}`]);
        rows.push(['绝对值判定', p.absValue]);
        rows.push(['增量', p.increment]);
        rows.push(['负值', p.negative ? '是（信号反相）' : '否']);
        rows.push(['刷脸状态', p.faceStatus]);
        rows.push(['进出方向', p.inOut]);
    } else if (e.typeKey === 'flow') {
        rows.push(['进 / 出人数', `${p.inCount} / ${p.outCount}`]);
        rows.push(['人/分钟', p.ratePerMin]);
    } else if (e.source === '分类门') {
        rows.push(['检出违禁品', `${p.contraband.name} × ${p.contraband.qty}`]);
        rows.push(['携带位置', p.contraband.position]);
        rows.push(['客流计数', `${p.flowCount} 人（${p.inOut}）`]);
    } else if (e.source === '明眸') {
        rows.push(['人员', `${p.personName} / ${p.personId}`]);
        rows.push(['比对相似度', p.registered ? `${p.similarity}%` : '未匹配']);
        rows.push(['体温', `${p.temperature}℃${p.overTemp ? '（超过 37.3℃）' : ''}`]);
        rows.push(['注册状态', p.registered ? '已注册' : '未注册']);
    } else if (e.source === '炸探' || e.source === '液探') {
        rows.push(['检出类别', p.kind]);
        rows.push([e.source === '炸探' ? '痕量物质' : '液体成分', p.trace || p.liquid]);
        rows.push(['检出结论', p.result]);
    } else if (e.source === '姿态') {
        rows.push(['员工 / 岗位', `${p.employee} / ${p.post}`]);
        rows.push(['行为', p.behavior]);
        if (e.typeKey === 'away') rows.push(['离岗时长 / 阈值', `${p.awayMin} 分钟 / ${p.thresholdMin} 分钟`]);
    }
    return rows;
}

function showEventDetail(e) {
    const store = getStore();
    const lv = LEVEL_META[e.level] || LEVEL_META.info;
    const bag = e.payload.bagId ? store.bags.find(b => b.id === e.payload.bagId) : null;
    const rows = [
        ['事件ID', e.id],
        ['上报时间', `${e.time}（${timeAgo(e.ts)}）`],
        ['来源设备', `${e.deviceName}（${e.deviceId}）`],
        ['站点 / 通道', `${e.site} / ${e.channel} ${e.channelName}`],
        ['事件类型', `${e.type}（${e.typeKey}）`],
        ['告警等级', `${lv.name}（${e.level}）`],
        ['缓存富化', `规则 ${e.cache.ruleKey}（TTL ${e.cache.ruleTtl}s）｜设备 ${e.cache.deviceKey}（TTL ${e.cache.deviceTtl}s）｜读取于 ${e.cache.readAt2 || '待处理'}`],
        ...payloadRows(e),
        ['双视角绑定', `${e.binding.view.status}｜${e.binding.view.detail}${e.binding.view.views.length ? `（${e.binding.view.views.join(' + ')}）` : ''}`],
        ['人脸绑定', `${e.binding.face.status}｜${e.binding.face.detail || '-'}${e.binding.face.eventId ? `（命中 ${e.binding.face.eventId}）` : ''}`],
        ['判图分流', `${e.judge.mode}｜结论 ${e.judge.result || '待判图'}｜耗时 ${e.judge.durationMs || 0}ms｜${e.judge.operator || '-'}`],
        ['处理结果', e.outcome || '-'],
        bag ? ['关联包裹处置', `${bag.judgeResult || '待判图'} / ${bag.disposition || '-'}`] : null
    ];
    openModal({
        title: `事件详情 - ${e.id}`,
        width: 720,
        bodyHTML: kvTableHTML(rows) + `
            <div style="margin-top:10px;font-size:12px;color:#909399;line-height:1.8;">
                处理链路：设备上报 → 缓存富化（rule:* / dev:*）→ 双视角绑定（10s 窗口 / 延迟队列 / DB 回查）→ 人脸绑定（6s × 20 次）→ 判图分流 → 事件落地
            </div>`
    });
}

function renderRules(store) {
    const eng = store.eventEngine;

    const ruleBody = document.getElementById('evtRulesBody');
    if (ruleBody) {
        ruleBody.innerHTML = eng.rules.map(r => {
            const lv = LEVEL_META[r.level] || LEVEL_META.info;
            return `
            <tr>
                <td>${r.key}</td>
                <td>${r.cacheKey}</td>
                <td>${r.ttl}s</td>
                <td>${r.type}</td>
                <td>${r.source}</td>
                <td><span class="status-tag ${lv.cls}">${lv.name}</span></td>
                <td>${r.bind}</td>
                <td>${r.judgeMode}</td>
                <td>${r.note}</td>
            </tr>`;
        }).join('');
    }

    const devBody = document.getElementById('evtDeviceCacheBody');
    if (devBody) {
        devBody.innerHTML = eng.deviceCache.map(d => {
            const cls = d.status === 'online' ? 'status-normal' : (d.status === 'warning' ? 'status-warning' : 'status-danger');
            const name = d.status === 'online' ? '在线' : (d.status === 'warning' ? '告警' : '离线');
            return `
            <tr>
                <td>${d.cacheKey}</td>
                <td>${d.deviceName}</td>
                <td>${d.channel}</td>
                <td>${d.site}</td>
                <td>${d.category}</td>
                <td>${d.ip}</td>
                <td><span class="status-tag ${cls}">${name}</span></td>
            </tr>`;
        }).join('');
    }
}

function renderSituation(store) {
    const box = document.getElementById('evtSituation');
    if (!box) return;
    box.innerHTML = store.eventEngine.situation.map(s => `
        <div class="situation-card ${s.status === '预警' ? 's-warn' : ''}">
            <div class="situation-head">
                <b>${s.name}</b>
                <span class="status-tag ${s.status === '预警' ? 'status-warning' : 'status-normal'}">${s.status}</span>
            </div>
            <div class="situation-value">${s.today}</div>
            <div class="situation-meta">
                <span>阈值 ${s.threshold}</span>
                <span>日增长 ${s.growth}</span>
            </div>
            <div class="situation-meta">
                <span>连续增长 ${s.consecutive} 日</span>
                <span>连续阈值 ${s.consecutiveLimit} 日</span>
            </div>
            <div class="situation-note">${s.note}</div>
        </div>`).join('');

    const covBody = document.getElementById('evtCoverageBody');
    if (covBody) {
        const eng = store.eventEngine;
        covBody.innerHTML = COVERAGE.map(c => {
            const n = eng.rawEvents.filter(e => e.source === c.source).length;
            return `
            <tr>
                <td>${c.cat}</td>
                <td>${c.desc}</td>
                <td>${n}</td>
                <td>${c.by}</td>
            </tr>`;
        }).join('');
    }
}

function fillSourceFilter(store) {
    const sel = document.getElementById('evtSourceFilter');
    if (!sel) return;
    const sources = [...new Set(EVENT_RULES.map(r => r.source))];
    sel.innerHTML = '<option value="">全部</option>' + sources.map(s => `<option value="${s}">${s}</option>`).join('');
}

function refresh() {
    const store = getStore();
    renderStats(store);
    renderStages(store);
    renderClock(store);
    renderLogs(store);
    renderBinding(store);
    renderRules(store);
    renderSituation(store);
    applyFilters();
}

window.initEventflowModule = function () {
    const store = getStore();
    initTabs();
    fillSourceFilter(store);

    ['evtSourceFilter', 'evtLevelFilter', 'evtStatusFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onchange = applyFilters;
    });
    const kw = document.getElementById('evtKeyword');
    if (kw) kw.onkeydown = ev => { if (ev.key === 'Enter') applyFilters(); };

    const tickBtn = document.getElementById('evtTickBtn');
    if (tickBtn) tickBtn.onclick = () => {
        const sum = runEventTick();
        const box = document.getElementById('evtTickResult');
        if (box) {
            box.textContent = `本轮（虚拟时钟 +${sum.advance}s）：缓存富化 ${sum.enriched}、双视角合并 ${sum.merged}、延迟入队 ${sum.delayed}、延迟过期 ${sum.expired}、DB 回查命中 ${sum.dbHit} / 未命中 ${sum.dbMiss}、人脸绑定 ${sum.faceBound}、人脸丢弃 ${sum.faceDropped}、完成判图 ${sum.judged}`;
        }
        toast('已推进一轮事件调度（虚拟时钟 +10s）', 'success');
        refresh();
        refreshNavBadges();
    };

    const ingestBtn = document.getElementById('evtIngestBtn');
    if (ingestBtn) ingestBtn.onclick = () => {
        const e = ingestDeviceEvent();
        toast(`设备上报事件 ${e.id}，已写入富化队列`, 'success');
        refresh();
        refreshNavBadges();
    };

    const exportBtn = document.getElementById('evtExportBtn');
    if (exportBtn) exportBtn.onclick = () => {
        const eng = getStore().eventEngine;
        exportCSV(`事件处理明细_${new Date().toISOString().slice(0, 10)}.csv`,
            ['事件ID', '时间', '来源', '设备', '站点', '通道', '事件类型', '告警等级', '双视角', '人脸绑定', '判图模式', '判图结论', '状态', '处理结果'],
            eng.rawEvents.map(e => [
                e.id, e.time, e.source, e.deviceName, e.site, `${e.channel}/${e.channelName}`,
                e.type, (LEVEL_META[e.level] || LEVEL_META.info).name,
                e.binding.view.status, e.binding.face.status,
                e.judge.mode, e.judge.result || '', e.status, e.outcome || ''
            ]));
    };

    refresh();
    console.log(`事件处理模块已加载：站点 ${EVENT_SITE}`);
};
