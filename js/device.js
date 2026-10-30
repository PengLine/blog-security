import { getStore } from './db.js';
import { paginateData, toast, openModal } from './utils.js';

// 分页变量
let currentDevicePage = 1;
const devicesPerPage = 20;
let filteredDevices = [];

// 各类型设备的实时状态项（键为数据键，值为显示名）
const STATUS_LABELS = {
    temperature: '机身温度', voltage: '供电电压', current: '工作电流', xRayDose: 'X光剂量',
    lampStatus: '光源状态', sensitivity: '灵敏度', alarmVolume: '告警音量', mode: '工作模式',
    lockStatus: '门磁状态', videoStatus: '视频流', recognitionRate: '识别成功率',
    battery: '电量', calibration: '校准状态', heartbeat: '心跳延迟'
};

// 按设备类型生成实时状态与可用操作
function buildDeviceRuntime(device, store) {
    const base = { heartbeat: `${30 + Math.floor(Math.random() * 40)}ms` };
    const byKey = {
        securityCheckMachine: { temperature: `${36 + Math.floor(Math.random() * 5)}℃`, voltage: '220V', current: '2.5A', xRayDose: '0.1μSv/h' },
        recheckTable: { temperature: `${33 + Math.floor(Math.random() * 4)}℃`, voltage: '220V', current: '1.2A', lampStatus: '正常' },
        metalDoor: { sensitivity: '中（18区）', voltage: '220V', current: '0.8A', alarmVolume: '70dB' },
        millimeterWaveDoor: { temperature: '44℃（偏高）', voltage: '220V', current: '1.5A', mode: '快速检查' },
        antiTheftDoor: { voltage: '220V', current: '0.5A', alarmVolume: '65dB' },
        classificationDoor: { voltage: device.status === 'offline' ? '0V（断电）' : '220V', current: device.status === 'offline' ? '0A' : '0.6A' },
        accessControl: { voltage: '12V', current: '0.3A', lockStatus: '正常' },
        accessVideo: { temperature: '36℃', voltage: '220V', current: '1.0A', videoStatus: device.status === 'warning' ? '偶发丢帧' : '正常' },
        personCertCompare: { temperature: '37℃', voltage: '220V', current: '1.2A', recognitionRate: '99.5%' },
        explosiveDetector: { battery: `${80 + Math.floor(Math.random() * 20)}%`, calibration: '已校准', mode: '标准模式' },
        liquidDetector: { battery: `${85 + Math.floor(Math.random() * 15)}%`, sensitivity: '高', mode: '自动模式' }
    };
    const opsByCategory = {
        '核心设备': ['校准', '灵敏度调整', '固件更新', '查看日志'],
        '安检门': ['切换模式', '调整灵敏度', '固件更新', '查看日志'],
        '明眸设备': ['远程开关门', '下发人脸库', '固件更新', '查看日志'],
        '探测设备': ['校准', '切换模式', '固件更新', '查看日志']
    };
    return {
        statusData: Object.assign({}, byKey[device.key] || {}, base),
        operations: ['重启设备'].concat(opsByCategory[device.category] || ['查看日志'])
    };
}

// 渲染设备列表
function renderDevices(devices) {
    const deviceTableBody = document.getElementById('deviceTableBody');
    if (!deviceTableBody) return;
    
    deviceTableBody.innerHTML = '';

    devices.forEach(device => {
        const statusMap = { online: ['在线', 'status-normal'], warning: ['告警', 'status-warning'], offline: ['离线', 'status-danger'] };
        const [sName, sClass] = statusMap[device.status];
        const typeMap = { security: '核心安检', door: '安检门', access: '明眸设备', detection: '探测设备' };
        const categoryType = device.category === '安检门' ? 'door' : device.type;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${device.id}</td>
            <td>${device.displayName}</td>
            <td>${typeMap[categoryType] || device.category}</td>
            <td>${device.ip}</td>
            <td><span class="status-tag ${sClass}">${sName}</span></td>
            <td>${device.location}</td>
            <td>
                <button class="btn btn-primary" data-detail="${device.id}">详情</button>
                <button class="btn btn-secondary" data-log="${device.id}">日志</button>
            </td>
        `;
        deviceTableBody.appendChild(row);
    });

    deviceTableBody.querySelectorAll('[data-detail]').forEach(btn => {
        btn.onclick = () => renderDeviceDetail(btn.dataset.detail);
    });
    deviceTableBody.querySelectorAll('[data-log]').forEach(btn => {
        btn.onclick = () => {
            const dev = getStore().devices.find(d => d.id === btn.dataset.log);
            const logs = [
                `${dev.name} 心跳正常 (${30 + Math.floor(Math.random() * 40)}ms)`,
                `${dev.name} 上传自检数据帧 seq=${Math.floor(Math.random() * 90000 + 10000)}`,
                dev.status === 'online' ? `${dev.name} 业务量上报：今日处理 ${Math.floor(Math.random() * 800 + 100)} 次` : `${dev.name} 链路异常，请检查供电与网口`,
                `${dev.name} 固件校验通过 ${dev.firmware}`
            ];
            openModal({
                title: `运行日志 - ${dev.displayName}`,
                width: 560,
                bodyHTML: `<div style="font-family:Consolas,monospace;font-size:12px;line-height:2;">${logs.map(l => `<div>[${new Date().toLocaleTimeString()}] ${l}</div>`).join('')}</div>`
            });
        };
    });
}

// 设备概览（真实数据）
function renderOverview() {
    const store = getStore();
    const overview = document.getElementById('devOverviewPanel');
    if (overview) {
        const counts = {
            total: store.devices.length,
            online: store.devices.filter(d => d.status === 'online').length,
            offline: store.devices.filter(d => d.status === 'offline').length,
            warning: store.devices.filter(d => d.status === 'warning').length
        };
        overview.innerHTML = `
            <div class="detail-item"><span class="detail-label">设备总数</span><span class="detail-value">${counts.total}</span></div>
            <div class="detail-item"><span class="detail-label">在线设备</span><span class="detail-value" style="color:#67c23a">${counts.online}</span></div>
            <div class="detail-item"><span class="detail-label">离线设备</span><span class="detail-value" style="color:#f56c6c">${counts.offline}</span></div>
            <div class="detail-item"><span class="detail-label">告警设备</span><span class="detail-value" style="color:#e6a23c">${counts.warning}</span></div>
            <div class="detail-item"><span class="detail-label">在线率</span><span class="detail-value">${(counts.online / counts.total * 100).toFixed(1)}%</span></div>`;
    }
    const catPanel = document.getElementById('devCategoryPanel');
    if (catPanel) {
        const cats = {};
        store.devices.forEach(d => { cats[d.category] = (cats[d.category] || 0) + 1; });
        catPanel.innerHTML = Object.entries(cats).map(([k, v]) =>
            `<div class="detail-item"><span class="detail-label">${k}</span><span class="detail-value">${v}</span></div>`).join('');
    }
}

// 加载设备详情（左侧导航点击入口，deviceKey → 该类型第一台）
window.loadDeviceDetail = function(deviceKey) {
    const store = getStore();
    const dev = store.devices.find(d => d.key === deviceKey);
    if (dev) renderDeviceDetail(dev.id);
};

// 渲染设备详情面板
function renderDeviceDetail(deviceId) {
    const store = getStore();
    const device = store.devices.find(d => d.id === deviceId);
    if (!device) return;

    const panel = document.getElementById('deviceDetailPanel');
    if (!panel) return;

    const runtime = buildDeviceRuntime(device, store);
    const statusClass = device.status === 'online' ? 'status-normal' : device.status === 'warning' ? 'status-warning' : 'status-danger';
    const statusText = device.status === 'online' ? '在线' : device.status === 'warning' ? '告警' : '离线';
    // 真实业务量：安检机统计今日过检包裹，其他设备统计关联事件
    const todayPass = device.key === 'securityCheckMachine'
        ? store.bags.filter(b => b.machine === device.id).length
        : Math.floor(device.operationCount / 37) % 900 + 100;
    const todayAlarms = store.alarms.filter(a => a.device === device.displayName).length;

    panel.innerHTML = `
        <div class="detail-panel" style="margin-bottom:20px;">
            <div class="detail-title">设备详情 - ${device.displayName}
                <span class="status-tag ${statusClass}" style="float:right;margin-top:5px;">${statusText}</span>
            </div>
            <div class="device-detail">
                <div>
                    <div class="detail-item"><span class="detail-label">设备ID</span><span class="detail-value">${device.id}</span></div>
                    <div class="detail-item"><span class="detail-label">所属通道</span><span class="detail-value">${device.location}</span></div>
                    <div class="detail-item"><span class="detail-label">IP地址</span><span class="detail-value">${device.ip}</span></div>
                    <div class="detail-item"><span class="detail-label">型号</span><span class="detail-value">${device.model}</span></div>
                    <div class="detail-item"><span class="detail-label">序列号</span><span class="detail-value">${device.serialNumber}</span></div>
                </div>
                <div>
                    <div class="detail-item"><span class="detail-label">软件版本</span><span class="detail-value">${device.firmware}</span></div>
                    <div class="detail-item"><span class="detail-label">上线时间</span><span class="detail-value">${device.onlineTime}</span></div>
                    <div class="detail-item"><span class="detail-label">上次维护</span><span class="detail-value">${device.lastMaintenance}</span></div>
                    <div class="detail-item"><span class="detail-label">下次维护</span><span class="detail-value">${device.nextMaintenance}</span></div>
                    <div class="detail-item"><span class="detail-label">今日业务量</span><span class="detail-value">${todayPass} ${device.key === 'securityCheckMachine' ? '件包裹' : '次'}</span></div>
                </div>
            </div>
            <div class="device-detail" style="margin-top:12px;">
                <div>
                    <div class="detail-title">实时状态</div>
                    ${Object.entries(runtime.statusData).map(([k, v]) => `
                        <div class="detail-item">
                            <span class="detail-label">${STATUS_LABELS[k] || k}</span>
                            <span class="detail-value">${v}</span>
                        </div>`).join('')}
                </div>
                <div>
                    <div class="detail-title">统计信息</div>
                    <div class="detail-item"><span class="detail-label">今日告警</span><span class="detail-value">${todayAlarms}</span></div>
                    <div class="detail-item"><span class="detail-label">累计操作</span><span class="detail-value">${device.operationCount}</span></div>
                    <div class="detail-item"><span class="detail-label">累计异常</span><span class="detail-value">${device.errorCount}</span></div>
                </div>
            </div>
            <div class="filter-bar" style="margin-top:16px;margin-bottom:0;">
                <div class="filter-group">
                    <span class="filter-label">远程运维：</span>
                    ${runtime.operations.map(op => `<button class="btn btn-primary" data-op="${op}">${op}</button>`).join('')}
                </div>
            </div>
        </div>`;

    panel.querySelectorAll('[data-op]').forEach(btn => {
        btn.onclick = () => {
            if (device.status === 'offline' && btn.dataset.op !== '查看日志') {
                toast(`${device.displayName} 已离线，指令无法下发`, 'error');
                return;
            }
            toast(`已向 ${device.displayName} 下发「${btn.dataset.op}」指令，等待执行结果`, 'info');
            setTimeout(() => toast(`${device.displayName}「${btn.dataset.op}」执行完成`, 'success'), 1500);
        };
    });

    panel.scrollIntoView({ behavior: 'smooth' });
}

// 应用筛选
function applyFilters() {
    const store = getStore();
    const type = document.getElementById('devTypeFilter').value;
    const status = document.getElementById('devStatusFilter').value;
    const keyword = document.getElementById('devKeyword').value.trim();

    filteredDevices = store.devices.filter(d => {
        const t = d.category === '安检门' ? 'door' : d.type;
        if (type && t !== type) return false;
        if (status && d.status !== status) return false;
        if (keyword && !(d.id + d.displayName + d.location).includes(keyword)) return false;
        return true;
    });
    currentDevicePage = 1;
    renderPage();
}

function renderPage() {
    renderDevices(paginateData(filteredDevices, currentDevicePage, devicesPerPage));
    renderDevicePagination();
}

// 渲染设备分页
function renderDevicePagination() {
    const moduleDiv = document.getElementById('device');
    if (!moduleDiv) return;
    
    const tableSection = moduleDiv.querySelector('.table-section');
    if (!tableSection) return;
    
    let paginationDiv = tableSection.querySelector('.pagination-page');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-page';
        tableSection.appendChild(paginationDiv);
    }
    
    const totalPages = Math.ceil(filteredDevices.length / devicesPerPage);
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    paginationDiv.innerHTML = `
        <button class="btn btn-secondary" ${currentDevicePage <= 1 ? 'disabled' : ''} id="devPrev">上一页</button>
        <span class="page-info">第 ${currentDevicePage} 页，共 ${totalPages} 页（${filteredDevices.length} 台）</span>
        <button class="btn btn-secondary" ${currentDevicePage >= totalPages ? 'disabled' : ''} id="devNext">下一页</button>
    `;
    document.getElementById('devPrev').onclick = () => { if (currentDevicePage > 1) { currentDevicePage--; renderPage(); } };
    document.getElementById('devNext').onclick = () => { if (currentDevicePage < totalPages) { currentDevicePage++; renderPage(); } };
}

// 全局初始化函数
window.initDeviceModule = function() {
    document.getElementById('devTypeFilter').onchange = applyFilters;
    document.getElementById('devStatusFilter').onchange = applyFilters;
    document.getElementById('devKeyword').onkeydown = (e) => { if (e.key === 'Enter') applyFilters(); };
    document.getElementById('devSearchBtn').onclick = applyFilters;
    document.getElementById('devResetBtn').onclick = () => {
        document.getElementById('devTypeFilter').value = '';
        document.getElementById('devStatusFilter').value = '';
        document.getElementById('devKeyword').value = '';
        applyFilters();
    };
    renderOverview();
    applyFilters();
};
