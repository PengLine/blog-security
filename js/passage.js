import { generateMockData } from './utils.js';

let mockData = {};

// 分页变量
let currentBindingPage = 1;
let currentPassagePage = 1;
const recordsPerPage = 20;

function initPage() {
    mockData = generatePassageMockData();
    renderStats();
    renderChannelControls();
    renderBindingRecords(getBindingPageData(1));
    renderBindingPagination();
    renderPassageRecords(getPassagePageData(1));
    renderPassagePagination();
}

// 获取绑定记录分页数据
function getBindingPageData(page) {
    const start = (page - 1) * recordsPerPage;
    const end = start + recordsPerPage;
    return mockData.bindingRecords.slice(start, end);
}

// 获取通行记录分页数据
function getPassagePageData(page) {
    const start = (page - 1) * recordsPerPage;
    const end = start + recordsPerPage;
    return mockData.passageRecords.slice(start, end);
}

function generatePassageMockData() {
    const channels = [
        { id: 'channel1', name: '1号通道', status: 'open', deviceId: 'DEV-101' },
        { id: 'channel2', name: '2号通道', status: 'open', deviceId: 'DEV-102' },
        { id: 'channel3', name: '3号通道', status: 'closed', deviceId: 'DEV-103' },
        { id: 'channel4', name: '4号通道', status: 'open', deviceId: 'DEV-104' },
        { id: 'channel5', name: '5号通道', status: 'open', deviceId: 'DEV-105' }
    ];

    const bindingRecords = [];
    for (let i = 0; i < 10; i++) {
        const time = new Date(Date.now() - Math.random() * 3600000);
        const status = Math.random() > 0.7 ? '已完成' : (Math.random() > 0.5 ? '通行中' : '待通行');
        bindingRecords.push({
            id: `BIND-${Date.now()}-${i}`,
            passengerId: `PASS-${Math.floor(Math.random() * 10000)}`,
            packageId: `PKG-${Date.now()}-${i}`,
            channel: `channel${Math.floor(Math.random() * 5) + 1}`,
            bindTime: time.toLocaleString(),
            status: status
        });
    }

    const passageRecords = [];
    for (let i = 0; i < 15; i++) {
        const time = new Date(Date.now() - Math.random() * 86400000);
        const temp = (Math.random() * 2 + 36).toFixed(1);
        const isContraband = Math.random() > 0.9;
        const status = isContraband || parseFloat(temp) > 37.3 ? '拒绝通行' : '允许通行';
        passageRecords.push({
            id: `PASS-${Date.now()}-${i}`,
            time: time.toLocaleString(),
            passengerId: `PASS-${Math.floor(Math.random() * 10000)}`,
            packageId: `PKG-${Date.now()}-${i}`,
            temperature: temp,
            contraband: isContraband ? ['刀具', '液体', '电池', '其他'][Math.floor(Math.random() * 4)] : '无',
            channel: `channel${Math.floor(Math.random() * 5) + 1}`,
            status: status
        });
    }

    const stats = {
        totalPassage: Math.floor(Math.random() * 5000) + 1000,
        tempAbnormal: Math.floor(Math.random() * 50) + 5,
        contrabandFound: Math.floor(Math.random() * 100) + 10,
        faceUnidentified: Math.floor(Math.random() * 200) + 20
    };

    return { channels, bindingRecords, passageRecords, stats };
}

function renderStats() {
    document.getElementById('totalPassage').textContent = mockData.stats.totalPassage;
    document.getElementById('tempAbnormal').textContent = mockData.stats.tempAbnormal;
    document.getElementById('contrabandFound').textContent = mockData.stats.contrabandFound;
    document.getElementById('faceUnidentified').textContent = mockData.stats.faceUnidentified;
}

function renderChannelControls() {
    const container = document.getElementById('channelControls');
    container.innerHTML = '';

    mockData.channels.forEach(channel => {
        const channelCard = document.createElement('div');
        channelCard.className = 'stat-card';
        channelCard.style.cursor = 'pointer';
        channelCard.style.textAlign = 'center';

        const statusText = channel.status === 'open' ? '开启' : '关闭';
        const statusClass = channel.status === 'open' ? 'status-normal' : 'status-danger';
        const btnText = channel.status === 'open' ? '关闭' : '开启';
        const btnClass = channel.status === 'open' ? 'btn-danger' : 'btn-success';

        channelCard.innerHTML = `
            <div style="font-size: 14px; color: #909399; margin-bottom: 8px;">${channel.name}</div>
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px;" class="${statusClass}">${statusText}</div>
            <button class="btn ${btnClass}" onclick="toggleChannel('${channel.id}')">${btnText}</button>
        `;

        container.appendChild(channelCard);
    });
}

function renderBindingRecords(records) {
    const tbody = document.getElementById('bindingTableBody');
    tbody.innerHTML = '';

    records.forEach(record => {
        const channel = mockData.channels.find(c => c.id === record.channel);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.passengerId}</td>
            <td>${record.packageId}</td>
            <td>${channel ? channel.name : '未知通道'}</td>
            <td>${record.bindTime}</td>
            <td><span class="status-tag ${record.status === '已完成' ? 'status-normal' : record.status === '通行中' ? 'status-processing' : 'status-warning'}">${record.status}</span></td>
            <td>
                <button class="btn btn-secondary" onclick="viewBindingDetail('${record.id}')">查看</button>
                <button class="btn btn-danger" onclick="unbindPassengerPackage('${record.id}')">解除绑定</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderPassageRecords(records) {
    const tbody = document.getElementById('passageRecordsTableBody');
    tbody.innerHTML = '';

    records.forEach(record => {
        const channel = mockData.channels.find(c => c.id === record.channel);
        const statusClass = record.status === '允许通行' ? 'status-normal' : 'status-danger';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.time}</td>
            <td>${record.passengerId}</td>
            <td>${record.packageId}</td>
            <td>${record.temperature}°C</td>
            <td>${record.contraband}</td>
            <td>${channel ? channel.name : '未知通道'}</td>
            <td><span class="status-tag ${statusClass}">${record.status}</span></td>
            <td><button class="btn btn-secondary" onclick="viewPassageDetail('${record.id}')">查看</button></td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染绑定记录分页
function renderBindingPagination() {
    const tableSection = document.querySelector('.module:nth-child(2) .table-section');
    if (!tableSection) return;
    
    let paginationDiv = tableSection.querySelector('.pagination-page');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-page';
        tableSection.appendChild(paginationDiv);
    }
    
    const totalPages = Math.ceil(mockData.bindingRecords.length / recordsPerPage);
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    paginationDiv.innerHTML = `
        <button class="btn btn-secondary" ${currentBindingPage <= 1 ? 'disabled' : ''} onclick="window.changeBindingPage(${currentBindingPage - 1})">上一页</button>
        <span class="page-info">第 ${currentBindingPage} 页，共 ${totalPages} 页</span>
        <button class="btn btn-secondary" ${currentBindingPage >= totalPages ? 'disabled' : ''} onclick="window.changeBindingPage(${currentBindingPage + 1})">下一页</button>
    `;
}

// 切换绑定记录页码
window.changeBindingPage = function(page) {
    currentBindingPage = page;
    renderBindingRecords(getBindingPageData(currentBindingPage));
    renderBindingPagination();
};

// 渲染通行记录分页
function renderPassagePagination() {
    const tableSection = document.querySelector('.module:nth-child(3) .table-section');
    if (!tableSection) return;
    
    let paginationDiv = tableSection.querySelector('.pagination-page');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-page';
        tableSection.appendChild(paginationDiv);
    }
    
    const totalPages = Math.ceil(mockData.passageRecords.length / recordsPerPage);
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    paginationDiv.innerHTML = `
        <button class="btn btn-secondary" ${currentPassagePage <= 1 ? 'disabled' : ''} onclick="window.changePassagePage(${currentPassagePage - 1})">上一页</button>
        <span class="page-info">第 ${currentPassagePage} 页，共 ${totalPages} 页</span>
        <button class="btn btn-secondary" ${currentPassagePage >= totalPages ? 'disabled' : ''} onclick="window.changePassagePage(${currentPassagePage + 1})">下一页</button>
    `;
}

// 切换通行记录页码
window.changePassagePage = function(page) {
    currentPassagePage = page;
    renderPassageRecords(getPassagePageData(currentPassagePage));
    renderPassagePagination();
};

function toggleChannel(channelId) {
    const channel = mockData.channels.find(c => c.id === channelId);
    if (channel) {
        channel.status = channel.status === 'open' ? 'closed' : 'open';
        renderChannelControls();
    }
}

function bindPassengerPackage() {
    const passengerId = document.getElementById('passengerId').value;
    const packageId = document.getElementById('packageId').value;
    const channelId = document.getElementById('channelSelect').value;

    if (!passengerId || !packageId) {
        alert('请填写人员ID和包裹ID');
        return;
    }

    const newBinding = {
        id: `BIND-${Date.now()}`,
        passengerId: passengerId,
        packageId: packageId,
        channel: channelId,
        bindTime: new Date().toLocaleString(),
        status: '待通行'
    };

    mockData.bindingRecords.unshift(newBinding);
    renderBindingRecords(mockData.bindingRecords);

    document.getElementById('passengerId').value = '';
    document.getElementById('packageId').value = '';
}

function unbindPassengerPackage(recordId) {
    if (recordId) {
        mockData.bindingRecords = mockData.bindingRecords.filter(r => r.id !== recordId);
    } else {
        const passengerId = document.getElementById('passengerId').value;
        const packageId = document.getElementById('packageId').value;
        if (passengerId) {
            mockData.bindingRecords = mockData.bindingRecords.filter(r => r.passengerId !== passengerId);
        }
        if (packageId) {
            mockData.bindingRecords = mockData.bindingRecords.filter(r => r.packageId !== packageId);
        }
    }
    renderBindingRecords(mockData.bindingRecords);
}

function viewBindingDetail(recordId) {
    const record = mockData.bindingRecords.find(r => r.id === recordId);
    if (record) {
        alert(`绑定详情：\nID: ${record.id}\n人员ID: ${record.passengerId}\n包裹ID: ${record.packageId}\n通道: ${record.channel}\n绑定时间: ${record.bindTime}\n状态: ${record.status}`);
    }
}

function viewPassageDetail(recordId) {
    const record = mockData.passageRecords.find(r => r.id === recordId);
    if (record) {
        alert(`通行详情：\nID: ${record.id}\n时间: ${record.time}\n人员ID: ${record.passengerId}\n包裹ID: ${record.packageId}\n体温: ${record.temperature}°C\n违禁品: ${record.contraband}\n通道: ${record.channel}\n状态: ${record.status}`);
    }
}

function addNewBinding() {
    alert('新增绑定功能开发中...');
}

function addNewPassageRecord() {
    alert('新增通行记录功能开发中...');
}

// 全局初始化函数
window.initPassageModule = function() {
    initPage();
};

const passageModule = document.getElementById('passage');
if (passageModule) {
    initPage();
    passageModule.addEventListener('DOMNodeInsertedIntoDocument', initPage);
}

window.toggleChannel = toggleChannel;
window.bindPassengerPackage = bindPassengerPackage;
window.unbindPassengerPackage = unbindPassengerPackage;
window.viewBindingDetail = viewBindingDetail;
window.viewPassageDetail = viewPassageDetail;
window.addNewBinding = addNewBinding;
window.addNewPassageRecord = addNewPassageRecord;