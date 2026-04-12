import { generateMockData } from './utils.js';

// 渲染设备列表
function renderDevices(devices) {
    const deviceTableBody = document.getElementById('deviceTableBody');
    if (!deviceTableBody) return;
    
    deviceTableBody.innerHTML = '';

    devices.forEach(device => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${device.id}</td>
            <td>${device.name}</td>
            <td>${device.type === 'security' ? '安检设备' : device.type === 'access' ? '门禁设备' : '探测设备'}</td>
            <td>${device.ip}</td>
            <td><span class="status-tag ${device.status.class}">${device.status.name}</span></td>
            <td>${device.location}</td>
            <td>
                <button class="btn btn-primary">详情</button>
                <button class="btn btn-secondary">配置</button>
            </td>
        `;
        deviceTableBody.appendChild(row);
    });
}

// 设备操作函数
function performDeviceOperation(operation, deviceId) {
    // 模拟设备操作
    console.log('执行设备操作:', operation, '设备ID:', deviceId);
    alert(`已执行操作: ${operation}`);
}

// 加载设备详情
function loadDeviceDetail(deviceType) {
    // 模拟不同类型设备的详情数据
    const deviceDetails = {
        securityCheckMachine: {
            id: 'DEV-1001',
            name: '安检机001',
            type: '安检机',
            ip: '192.168.1.101',
            status: 'online',
            location: '1号通道',
            model: 'DS-8065',
            serialNumber: '20230801001',
            softwareVersion: 'V2.5.1',
            hardwareVersion: 'V1.0',
            lastMaintenance: '2024-01-15',
            nextMaintenance: '2024-04-15',
            statistics: {
                todayPass: 1256,
                todayAlarms: 3,
                totalPass: 125678,
                totalAlarms: 234
            },
            statusData: {
                temperature: '38°C',
                voltage: '220V',
                current: '2.5A',
                xRayDose: '0.1μSv/h'
            },
            operations: ['重启设备', '校准', '灵敏度调整', '固件更新', '查看日志']
        },
        recheckTable: {
            id: 'DEV-1002',
            name: '复检台001',
            type: '复检台',
            ip: '192.168.1.102',
            status: 'online',
            location: '2号通道',
            model: 'DS-RECHECK01',
            serialNumber: '20230901001',
            softwareVersion: 'V1.2.0',
            hardwareVersion: 'V1.0',
            lastMaintenance: '2024-01-20',
            nextMaintenance: '2024-04-20',
            statistics: {
                todayCheck: 156,
                todayAlarms: 5,
                totalCheck: 12345,
                totalAlarms: 189
            },
            statusData: {
                temperature: '35°C',
                voltage: '220V',
                current: '1.2A',
                lampStatus: '正常'
            },
            operations: ['重启设备', '调整亮度', '固件更新', '查看日志']
        },
        metalDoor: {
            id: 'DEV-1003',
            name: '金属门001',
            type: '金属门',
            ip: '192.168.1.103',
            status: 'online',
            location: '3号通道',
            model: 'DS-METAL01',
            serialNumber: '20231001001',
            softwareVersion: 'V3.1.0',
            hardwareVersion: 'V2.0',
            lastMaintenance: '2024-01-18',
            nextMaintenance: '2024-04-18',
            statistics: {
                todayPass: 2345,
                todayAlarms: 12,
                totalPass: 234567,
                totalAlarms: 1234
            },
            statusData: {
                sensitivity: '中',
                voltage: '220V',
                current: '0.8A',
                alarmVolume: '70dB'
            },
            operations: ['重启设备', '调整灵敏度', '调整音量', '固件更新', '查看日志']
        },
        millimeterWaveDoor: {
            id: 'DEV-1004',
            name: '毫米波门001',
            type: '毫米波门',
            ip: '192.168.1.104',
            status: 'warning',
            location: '4号通道',
            model: 'DS-MMW01',
            serialNumber: '20231101001',
            softwareVersion: 'V2.0.0',
            hardwareVersion: 'V1.0',
            lastMaintenance: '2024-01-10',
            nextMaintenance: '2024-04-10',
            statistics: {
                todayPass: 1876,
                todayAlarms: 8,
                totalPass: 187654,
                totalAlarms: 876
            },
            statusData: {
                temperature: '40°C',
                voltage: '220V',
                current: '1.5A',
                mode: '快速检查'
            },
            operations: ['重启设备', '切换模式', '固件更新', '查看日志']
        },
        antiTheftDoor: {
            id: 'DEV-1005',
            name: '防损门001',
            type: '防损门',
            ip: '192.168.1.105',
            status: 'online',
            location: '5号通道',
            model: 'DS-ANTI01',
            serialNumber: '20231201001',
            softwareVersion: 'V1.5.0',
            hardwareVersion: 'V1.0',
            lastMaintenance: '2024-01-22',
            nextMaintenance: '2024-04-22',
            statistics: {
                todayPass: 3456,
                todayAlarms: 5,
                totalPass: 345678,
                totalAlarms: 567
            },
            statusData: {
                voltage: '220V',
                current: '0.5A',
                alarmVolume: '65dB'
            },
            operations: ['重启设备', '调整音量', '固件更新', '查看日志']
        },
        classificationDoor: {
            id: 'DEV-1006',
            name: '分类门001',
            type: '分类门',
            ip: '192.168.1.106',
            status: 'offline',
            location: '6号通道',
            model: 'DS-CLASS01',
            serialNumber: '20240101001',
            softwareVersion: 'V1.0.0',
            hardwareVersion: 'V1.0',
            lastMaintenance: '2024-01-05',
            nextMaintenance: '2024-04-05',
            statistics: {
                todayPass: 0,
                todayAlarms: 0,
                totalPass: 12345,
                totalAlarms: 45
            },
            statusData: {
                voltage: '0V',
                current: '0A'
            },
            operations: ['重启设备', '固件更新', '查看日志']
        },
        accessControl: {
            id: 'DEV-1007',
            name: '门禁设备001',
            type: '门禁设备',
            ip: '192.168.1.107',
            status: 'online',
            location: '7号通道',
            model: 'DS-ACCESS01',
            serialNumber: '20230701001',
            softwareVersion: 'V2.2.0',
            hardwareVersion: 'V1.5',
            lastMaintenance: '2024-01-12',
            nextMaintenance: '2024-04-12',
            statistics: {
                todayPass: 890,
                todayAlarms: 2,
                totalPass: 89012,
                totalAlarms: 123
            },
            statusData: {
                voltage: '12V',
                current: '0.3A',
                lockStatus: '正常'
            },
            operations: ['重启设备', '开关门', '固件更新', '查看日志']
        },
        accessVideo: {
            id: 'DEV-1008',
            name: '门禁视频一体机001',
            type: '门禁视频一体机',
            ip: '192.168.1.108',
            status: 'online',
            location: '8号通道',
            model: 'DS-VIDEO01',
            serialNumber: '20230901002',
            softwareVersion: 'V3.0.0',
            hardwareVersion: 'V2.0',
            lastMaintenance: '2024-01-14',
            nextMaintenance: '2024-04-14',
            statistics: {
                todayPass: 1567,
                todayAlarms: 4,
                totalPass: 156789,
                totalAlarms: 345
            },
            statusData: {
                temperature: '36°C',
                voltage: '220V',
                current: '1.0A',
                videoStatus: '正常'
            },
            operations: ['重启设备', '查看视频', '固件更新', '查看日志']
        },
        personCertCompare: {
            id: 'DEV-1009',
            name: '人证对比001',
            type: '人证对比',
            ip: '192.168.1.109',
            status: 'online',
            location: '9号通道',
            model: 'DS-FACE01',
            serialNumber: '20231001002',
            softwareVersion: 'V2.8.0',
            hardwareVersion: 'V1.5',
            lastMaintenance: '2024-01-16',
            nextMaintenance: '2024-04-16',
            statistics: {
                todayPass: 2134,
                todayAlarms: 6,
                totalPass: 213456,
                totalAlarms: 456
            },
            statusData: {
                temperature: '37°C',
                voltage: '220V',
                current: '1.2A',
                recognitionRate: '99.5%'
            },
            operations: ['重启设备', '查看记录', '固件更新', '查看日志']
        },
        explosiveDetector: {
            id: 'DEV-1010',
            name: '炸探001',
            type: '炸探',
            ip: '192.168.1.110',
            status: 'online',
            location: '10号通道',
            model: 'DS-EXPLOSIVE01',
            serialNumber: '20231101002',
            softwareVersion: 'V1.8.0',
            hardwareVersion: 'V1.0',
            lastMaintenance: '2024-01-18',
            nextMaintenance: '2024-04-18',
            statistics: {
                todayCheck: 345,
                todayAlarms: 1,
                totalCheck: 34567,
                totalAlarms: 45
            },
            statusData: {
                battery: '95%',
                calibration: '已校准',
                mode: '标准模式'
            },
            operations: ['重启设备', '校准', '切换模式', '固件更新', '查看日志']
        },
        liquidDetector: {
            id: 'DEV-1011',
            name: '液探001',
            type: '液探',
            ip: '192.168.1.111',
            status: 'online',
            location: '11号通道',
            model: 'DS-LIQUID01',
            serialNumber: '20231201002',
            softwareVersion: 'V1.5.0',
            hardwareVersion: 'V1.0',
            lastMaintenance: '2024-01-20',
            nextMaintenance: '2024-04-20',
            statistics: {
                todayCheck: 456,
                todayAlarms: 2,
                totalCheck: 45678,
                totalAlarms: 78
            },
            statusData: {
                battery: '100%',
                sensitivity: '高',
                mode: '自动模式'
            },
            operations: ['重启设备', '调整灵敏度', '切换模式', '固件更新', '查看日志']
        }
    };

    const detail = deviceDetails[deviceType];
    if (!detail) return;

    // 获取设备详情展示区域
    let deviceDetailPanel = document.getElementById('deviceDetailPanel');
    if (!deviceDetailPanel) {
        // 如果不存在，则创建设备详情面板
        deviceDetailPanel = document.createElement('div');
        deviceDetailPanel.id = 'deviceDetailPanel';
        deviceDetailPanel.className = 'detail-panel';
        deviceDetailPanel.style.marginTop = '20px';
        
        // 添加到设备管理模块中
        const deviceModule = document.getElementById('device');
        const tableSection = deviceModule.querySelector('.table-section');
        if (tableSection) {
            deviceModule.insertBefore(deviceDetailPanel, tableSection);
        }
    }

    // 渲染设备详情
    const statusClass = detail.status === 'online' ? 'status-normal' : detail.status === 'warning' ? 'status-warning' : 'status-danger';
    const statusText = detail.status === 'online' ? '在线' : detail.status === 'warning' ? '警告' : '离线';

    deviceDetailPanel.innerHTML = `
        <div class="detail-title">设备详情 - ${detail.name}
            <span class="status-tag ${statusClass}" style="float: right; margin-top: 5px;">${statusText}</span>
        </div>
        
        <div class="device-detail">
            <div class="detail-panel">
                <div class="detail-title">基本信息</div>
                <div class="detail-item">
                    <span class="detail-label">设备ID</span>
                    <span class="detail-value">${detail.id}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">设备名称</span>
                    <span class="detail-value">${detail.name}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">设备类型</span>
                    <span class="detail-value">${detail.type}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">IP地址</span>
                    <span class="detail-value">${detail.ip}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">位置</span>
                    <span class="detail-value">${detail.location}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">型号</span>
                    <span class="detail-value">${detail.model}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">序列号</span>
                    <span class="detail-value">${detail.serialNumber}</span>
                </div>
            </div>
            
            <div class="detail-panel">
                <div class="detail-title">版本信息</div>
                <div class="detail-item">
                    <span class="detail-label">软件版本</span>
                    <span class="detail-value">${detail.softwareVersion}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">硬件版本</span>
                    <span class="detail-value">${detail.hardwareVersion}</span>
                </div>
                <div class="detail-title">维护信息</div>
                <div class="detail-item">
                    <span class="detail-label">上次维护</span>
                    <span class="detail-value">${detail.lastMaintenance}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">下次维护</span>
                    <span class="detail-value">${detail.nextMaintenance}</span>
                </div>
            </div>
        </div>
        
        <div class="device-detail">
            <div class="detail-panel">
                <div class="detail-title">实时状态</div>
                ${Object.entries(detail.statusData).map(([key, value]) => `
                    <div class="detail-item">
                        <span class="detail-label">${key}</span>
                        <span class="detail-value">${value}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="detail-panel">
                <div class="detail-title">统计信息</div>
                <div class="detail-item">
                    <span class="detail-label">今日通过</span>
                    <span class="detail-value">${detail.statistics.todayPass}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">今日告警</span>
                    <span class="detail-value">${detail.statistics.todayAlarms}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">累计通过</span>
                    <span class="detail-value">${detail.statistics.totalPass}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">累计告警</span>
                    <span class="detail-value">${detail.statistics.totalAlarms}</span>
                </div>
            </div>
        </div>
        
        <div class="filter-bar" style="margin-top: 20px;">
            <div class="filter-group">
                ${detail.operations.map(operation => `
                    <button class="btn btn-primary" onclick="performDeviceOperation('${operation}', '${detail.id}')">${operation}</button>
                `).join('')}
            </div>
        </div>
    `;
}

// 加载设备管理数据
function loadDeviceData() {
    const data = generateMockData();
    renderDevices(data.devices);
}

// 当设备管理模块显示时加载数据
const deviceModule = document.getElementById('device');
if (deviceModule) {
    // 初始加载
    loadDeviceData();
    
    // 监听模块显示事件（如果需要）
    deviceModule.addEventListener('DOMNodeInsertedIntoDocument', loadDeviceData);
}