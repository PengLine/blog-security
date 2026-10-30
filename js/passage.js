import { getStore, toggleChannel, bindPassengerPackage as dbBind, unbindPackage } from './db.js';
import { toast, openModal, kvTableHTML, exportCSV, paginateData, timeAgo } from './utils.js';

let mockData = { bindingRecords: [], passageRecords: [], channels: [], stats: {} };
let currentBindingPage = 1;
let currentPassagePage = 1;
const recordsPerPage = 15;

function initPage() {
    buildViewData();
    renderStats();
    renderChannelControls();
    renderBindingRecords(paginateData(mockData.bindingRecords, currentBindingPage, recordsPerPage));
    renderBindingPagination();
    renderPassageRecords(paginateData(mockData.passageRecords, currentPassagePage, recordsPerPage));
    renderPassagePagination();
}

// 从统一业务中枢构建视图数据（人-包-通道全部关联）
function buildViewData() {
    const store = getStore();
    const passengerMap = {};
    store.passengers.forEach(p => { passengerMap[p.id] = p; });

    mockData.channels = store.channels;

    // 绑定记录：已绑定的人包关系
    mockData.bindingRecords = store.bags
        .filter(b => b.bindingStatus === '已绑定' && passengerMap[b.owner])
        .slice(0, 120)
        .map(b => {
            const p = passengerMap[b.owner];
            return {
                id: `BIND-${b.id}`,
                passengerId: p.id, passengerName: p.name,
                packageId: b.id, channel: b.channel,
                bindTime: p.checkInTime,
                status: b.status === 'pending' ? '待检' : b.disposition === '放行' || b.disposition === '复检放行' ? '已完成' : b.disposition ? '处置中' : '通行中',
                temperature: p.temperature
            };
        });

    // 通行记录：过检包裹 + 旅客体温/黑名单校验结果
    const blackIds = new Set(store.blacklist.map(x => x.personId));
    mockData.passageRecords = store.bags.slice(0, 150).map(b => {
        const p = passengerMap[b.owner] || {};
        const tempAbnormal = (p.temperature || 36.5) > 37.3;
        const blacklisted = blackIds.has(b.owner);
        let status = '允许通行';
        if (blacklisted) status = '拒绝通行';
        else if (tempAbnormal) status = '体温复测';
        else if (b.judgeResult === '违禁' || b.disposition === '开包查扣') status = '物品查扣';
        else if (b.status === 'pending') status = '待判图';
        return {
            id: `PSG-${b.id}`,
            time: b.scanTime, ts: b.scanTs,
            passengerId: b.owner, passengerName: b.ownerName,
            packageId: b.id,
            temperature: p.temperature || '-',
            contraband: b.seized ? b.seized.itemName : (b.ai && b.judgeResult !== '正常' ? b.ai.label : '无'),
            channel: b.channel, channelName: b.channelName,
            status, blacklisted
        };
    });

    mockData.stats = {
        totalPassage: store.bags.length,
        tempAbnormal: store.passengers.filter(p => p.temperature > 37.3).length,
        contrabandFound: store.bags.filter(b => b.disposition === '开包查扣').length,
        faceUnidentified: store.recognitionRecords.filter(r => r.status === '未识别').length
    };
}

function renderStats() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('totalPassage', mockData.stats.totalPassage);
    set('tempAbnormal', mockData.stats.tempAbnormal);
    set('contrabandFound', mockData.stats.contrabandFound);
    set('faceUnidentified', mockData.stats.faceUnidentified);
}

function renderChannelControls() {
    const container = document.getElementById('channelControls');
    if (!container) return;
    container.innerHTML = '';

    mockData.channels.forEach(channel => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.cursor = 'pointer';
        card.style.textAlign = 'center';

        const statusText = channel.status === 'open' ? '开放' : channel.status === 'busy' ? '繁忙' : '关闭';
        const statusClass = channel.status === 'open' ? 'status-normal' : channel.status === 'busy' ? 'status-warning' : 'status-danger';

        card.innerHTML = `
            <div style="font-size:14px;color:#909399;margin-bottom:8px;">${channel.name}</div>
            <div style="font-size:20px;font-weight:bold;margin-bottom:6px;" class="${statusClass}">${statusText}</div>
            <div style="font-size:12px;color:#909399;margin-bottom:8px;">今日过检 ${channel.throughputToday} 件 · 排队 ${channel.queue} 人</div>
            <button class="btn ${channel.status === 'closed' ? 'btn-success' : 'btn-danger'}" data-ch="${channel.id}">${channel.status === 'closed' ? '开启通道' : '关闭通道'}</button>
        `;
        card.querySelector('[data-ch]').onclick = (e) => {
            e.stopPropagation();
            toggleChannel(channel.id);
            toast(`${channel.name} 已${channel.status === 'open' ? '关闭' : '开启'}`, 'info');
            initPage();
        };
        container.appendChild(card);
    });
}

function renderBindingRecords(records) {
    const tbody = document.getElementById('bindingTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    records.forEach(record => {
        const channel = mockData.channels.find(c => c.id === record.channel);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.passengerId}<div style="font-size:11px;color:#909399">${record.passengerName}</div></td>
            <td>${record.packageId}</td>
            <td>${channel ? channel.name : '未知通道'}</td>
            <td>${record.bindTime}</td>
            <td><span class="status-tag ${record.status === '已完成' ? 'status-normal' : record.status === '处置中' ? 'status-danger' : record.status === '通行中' ? 'status-processing' : 'status-warning'}">${record.status}</span></td>
            <td>
                <button class="btn btn-secondary" data-view="${record.id}">查看</button>
                <button class="btn btn-danger" data-unbind="${record.packageId}">解除绑定</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => {
        const r = mockData.bindingRecords.find(x => x.id === btn.dataset.view);
        if (r) openModal({
            title: `绑定详情 - ${r.id}`, width: 520,
            bodyHTML: kvTableHTML([
                ['人员ID', r.passengerId], ['姓名', r.passengerName], ['包裹ID', r.packageId],
                ['通道', (mockData.channels.find(c => c.id === r.channel) || {}).name],
                ['绑定时间', r.bindTime], ['体温', `${r.temperature}℃`], ['当前状态', r.status]
            ])
        });
    });
    tbody.querySelectorAll('[data-unbind]').forEach(btn => btn.onclick = () => {
        unbindPackage(btn.dataset.unbind);
        toast(`包裹 ${btn.dataset.unbind} 已解除人包绑定`, 'info');
        initPage();
    });
}

function renderPassageRecords(records) {
    const tbody = document.getElementById('passageRecordsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    records.forEach(record => {
        const statusClass = record.status === '允许通行' ? 'status-normal'
            : record.status === '拒绝通行' ? 'status-danger'
            : record.status === '物品查扣' ? 'status-danger'
            : record.status === '待判图' ? 'status-processing' : 'status-warning';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.time}<div style="font-size:11px;color:#909399">${timeAgo(record.ts)}</div></td>
            <td>${record.passengerId}<div style="font-size:11px;color:#909399">${record.passengerName}${record.blacklisted ? ' ⚠黑名单' : ''}</div></td>
            <td>${record.packageId}</td>
            <td>${record.temperature}℃</td>
            <td>${record.contraband}</td>
            <td>${record.channelName}</td>
            <td><span class="status-tag ${statusClass}">${record.status}</span></td>
            <td><button class="btn btn-secondary" data-pdetail="${record.id}">查看</button></td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-pdetail]').forEach(btn => btn.onclick = () => {
        const r = mockData.passageRecords.find(x => x.id === btn.dataset.pdetail);
        if (r) openModal({
            title: `通行详情 - ${r.packageId}`, width: 560,
            bodyHTML: kvTableHTML([
                ['通行时间', r.time], ['旅客', `${r.passengerName}（${r.passengerId}）`],
                ['体温', `${r.temperature}℃`], ['检出物品', r.contraband],
                ['通道', r.channelName], ['通行结论', r.status],
                ['黑名单命中', r.blacklisted ? '是，已拦截并通知值班队长' : '否']
            ])
        });
    });
}

// 渲染绑定记录分页
function renderBindingPagination() {
    const sections = document.querySelectorAll('#passage .table-section');
    const tableSection = sections[0];
    if (!tableSection) return;
    let pag = tableSection.querySelector('.pagination-page');
    if (!pag) {
        pag = document.createElement('div');
        pag.className = 'pagination-page';
        tableSection.appendChild(pag);
    }
    const totalPages = Math.ceil(mockData.bindingRecords.length / recordsPerPage);
    pag.innerHTML = totalPages <= 1 ? '' : `
        <button class="btn btn-secondary" ${currentBindingPage <= 1 ? 'disabled' : ''} id="bindPrev">上一页</button>
        <span class="page-info">第 ${currentBindingPage} 页，共 ${totalPages} 页</span>
        <button class="btn btn-secondary" ${currentBindingPage >= totalPages ? 'disabled' : ''} id="bindNext">下一页</button>
    `;
    if (totalPages > 1) {
        document.getElementById('bindPrev').onclick = () => { currentBindingPage--; renderBindingRecords(paginateData(mockData.bindingRecords, currentBindingPage, recordsPerPage)); renderBindingPagination(); };
        document.getElementById('bindNext').onclick = () => { currentBindingPage++; renderBindingRecords(paginateData(mockData.bindingRecords, currentBindingPage, recordsPerPage)); renderBindingPagination(); };
    }
}

// 渲染通行记录分页
function renderPassagePagination() {
    const sections = document.querySelectorAll('#passage .table-section');
    const tableSection = sections[1];
    if (!tableSection) return;
    let pag = tableSection.querySelector('.pagination-page');
    if (!pag) {
        pag = document.createElement('div');
        pag.className = 'pagination-page';
        tableSection.appendChild(pag);
    }
    const totalPages = Math.ceil(mockData.passageRecords.length / recordsPerPage);
    pag.innerHTML = totalPages <= 1 ? '' : `
        <button class="btn btn-secondary" ${currentPassagePage <= 1 ? 'disabled' : ''} id="psgPrev">上一页</button>
        <span class="page-info">第 ${currentPassagePage} 页，共 ${totalPages} 页</span>
        <button class="btn btn-secondary" ${currentPassagePage >= totalPages ? 'disabled' : ''} id="psgNext">下一页</button>
    `;
    if (totalPages > 1) {
        document.getElementById('psgPrev').onclick = () => { currentPassagePage--; renderPassageRecords(paginateData(mockData.passageRecords, currentPassagePage, recordsPerPage)); renderPassagePagination(); };
        document.getElementById('psgNext').onclick = () => { currentPassagePage++; renderPassageRecords(paginateData(mockData.passageRecords, currentPassagePage, recordsPerPage)); renderPassagePagination(); };
    }
}

// 绑定操作（校验人员库/包裹库，真实写入）
window.bindPassengerPackage = function() {
    const passengerId = document.getElementById('passengerId').value.trim();
    const packageId = document.getElementById('packageId').value.trim();
    const channelId = document.getElementById('channelSelect').value;

    if (!passengerId || !packageId) { toast('请填写人员ID和包裹ID', 'warning'); return; }
    const result = dbBind(passengerId, packageId, channelId);
    if (!result.ok) { toast(result.msg, 'error'); return; }
    toast(`绑定成功：${result.passenger.name} ↔ ${result.bag.id}（${result.bag.channelName}）`, 'success');
    document.getElementById('passengerId').value = '';
    document.getElementById('packageId').value = '';
    initPage();
};

window.unbindPassengerPackage = function(recordId) {
    const packageId = recordId || document.getElementById('packageId').value.trim();
    if (!packageId) { toast('请填写要解绑的包裹ID', 'warning'); return; }
    const b = unbindPackage(packageId);
    if (!b) { toast(`未找到包裹 ${packageId}`, 'error'); return; }
    toast(`包裹 ${packageId} 已解除绑定`, 'info');
    initPage();
};

window.addNewBinding = function() {
    document.getElementById('passengerId').focus();
    toast('请在下方表单输入人员ID与包裹ID后点击「绑定」', 'info');
};

// 全局初始化函数
window.initPassageModule = function() {
    initPage();
    const exportBtn = document.getElementById('passageExportBtn');
    if (exportBtn) exportBtn.onclick = () => {
        exportCSV(`通行台账_${new Date().toISOString().slice(0, 10)}.csv`,
            ['时间', '人员ID', '姓名', '包裹ID', '体温', '检出物品', '通道', '结论'],
            mockData.passageRecords.map(r => [r.time, r.passengerId, r.passengerName, r.packageId, r.temperature, r.contraband, r.channelName, r.status]));
    };
};
