// 模拟数据生成函数
export function generateMockData() {
    // 设备列表数据
    const deviceTypes = [
        { name: "安检机", type: "security", ip: "192.168.1.101", status: "online", location: "1号通道", model: "X-Ray-500", firmware: "v1.2.3", onlineTime: "2026-01-16 08:30:00", lastMaintenance: "2025-12-20" },
        { name: "复检台", type: "security", ip: "192.168.1.102", status: "online", location: "2号通道", model: "Recheck-200", firmware: "v1.1.5", onlineTime: "2026-01-16 08:35:00", lastMaintenance: "2025-12-25" },
        { name: "金属门", type: "access", ip: "192.168.1.103", status: "online", location: "3号通道", model: "Metal-Door-3000", firmware: "v2.0.1", onlineTime: "2026-01-16 08:40:00", lastMaintenance: "2025-12-18" },
        { name: "毫米波门", type: "access", ip: "192.168.1.104", status: "warning", location: "4号通道", model: "MMW-Door-5000", firmware: "v2.1.0", onlineTime: "2026-01-16 08:45:00", lastMaintenance: "2025-12-15" },
        { name: "防损门", type: "access", ip: "192.168.1.105", status: "online", location: "5号通道", model: "AntiTheft-1000", firmware: "v1.5.2", onlineTime: "2026-01-16 08:50:00", lastMaintenance: "2025-12-22" },
        { name: "分类门", type: "access", ip: "192.168.1.106", status: "offline", location: "6号通道", model: "Classify-2000", firmware: "v1.3.0", onlineTime: "2026-01-16 08:25:00", lastMaintenance: "2025-12-30" },
        { name: "门禁设备", type: "access", ip: "192.168.1.107", status: "online", location: "7号通道", model: "Access-4000", firmware: "v3.0.2", onlineTime: "2026-01-16 08:32:00", lastMaintenance: "2025-12-28" },
        { name: "门禁视频一体机", type: "access", ip: "192.168.1.108", status: "online", location: "8号通道", model: "Access-Video-6000", firmware: "v2.5.1", onlineTime: "2026-01-16 08:38:00", lastMaintenance: "2026-01-05" },
        { name: "人证对比", type: "access", ip: "192.168.1.109", status: "online", location: "9号通道", model: "Face-Compare-7000", firmware: "v4.0.0", onlineTime: "2026-01-16 08:42:00", lastMaintenance: "2026-01-10" },
        { name: "炸探", type: "detection", ip: "192.168.1.110", status: "online", location: "10号通道", model: "Explosive-Detector-8000", firmware: "v1.8.5", onlineTime: "2026-01-16 08:48:00", lastMaintenance: "2025-12-24" },
        { name: "液探", type: "detection", ip: "192.168.1.111", status: "online", location: "11号通道", model: "Liquid-Detector-9000", firmware: "v1.9.2", onlineTime: "2026-01-16 08:52:00", lastMaintenance: "2025-12-26" }
    ];

    // 事件类型
    const eventTypes = [
        { name: "正常通过", type: "passenger", status: "normal", desc: "人员正常通过安检" },
        { name: "金属检测", type: "metal", status: "warning", desc: "检测到金属物品" },
        { name: "违禁品检测", type: "contraband", status: "danger", desc: "检测到违禁物品" },
        { name: "温度异常", type: "face", status: "warning", desc: "体温检测异常" },
        { name: "未刷脸", type: "face", status: "warning", desc: "未进行人脸识别" },
        { name: "未注册", type: "face", status: "warning", desc: "人员未注册" },
        { name: "包裹异常", type: "contraband", status: "danger", desc: "包裹检测异常" },
        { name: "人脸绑定", type: "face", status: "normal", desc: "成功绑定人脸信息" },
        { name: "双视角绑定", type: "contraband", status: "processing", desc: "正在进行双视角绑定" },
        { name: "集中判图", type: "contraband", status: "processing", desc: "正在进行集中判图" },
        { name: "设备离线", type: "device", status: "danger", desc: "设备离线告警" },
        { name: "设备在线", type: "device", status: "normal", desc: "设备恢复在线" },
        { name: "网络异常", type: "system", status: "warning", desc: "网络连接异常" },
        { name: "系统重启", type: "system", status: "normal", desc: "系统正常重启" },
        { name: "数据备份", type: "system", status: "normal", desc: "系统数据备份完成" }
    ];

    // 状态映射
    const statusMap = {
        normal: { name: "正常", class: "status-normal" },
        warning: { name: "警告", class: "status-warning" },
        danger: { name: "危险", class: "status-danger" },
        processing: { name: "处理中", class: "status-processing" }
    };

    // 设备状态映射
    const deviceStatusMap = {
        online: { name: "在线", class: "status-normal" },
        offline: { name: "离线", class: "status-danger" },
        warning: { name: "告警", class: "status-warning" }
    };

    // 生成统计数据
    const stats = [
        { title: "今日客流", value: Math.floor(Math.random() * 5000) + 1000, trend: Math.random() > 0.5 ? "up" : "down", change: Math.floor(Math.random() * 20) + 1 },
        { title: "违禁品检测", value: Math.floor(Math.random() * 100) + 10, trend: Math.random() > 0.5 ? "up" : "down", change: Math.floor(Math.random() * 10) + 1 },
        { title: "温度异常", value: Math.floor(Math.random() * 50) + 5, trend: Math.random() > 0.5 ? "up" : "down", change: Math.floor(Math.random() * 5) + 1 },
        { title: "设备在线率", value: (Math.random() * 10 + 90).toFixed(1), trend: "up", change: 0.5 },
        { title: "包裹检测", value: Math.floor(Math.random() * 3000) + 500, trend: Math.random() > 0.5 ? "up" : "down", change: Math.floor(Math.random() * 15) + 1 },
        { title: "人脸识别率", value: (Math.random() * 5 + 95).toFixed(1), trend: "up", change: 0.3 }
    ];

    // 生成事件数据
    const events = [];
    for (let i = 0; i < 100; i++) {
        const time = new Date(Date.now() - Math.random() * 86400000);
        const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        const device = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
        const status = statusMap[eventType.status];
        const processStatus = Math.random() > 0.7 ? "已处理" : (Math.random() > 0.5 ? "处理中" : "未处理");
        const passengerId = Math.random() > 0.5 ? `PASS-${Math.floor(Math.random() * 10000)}` : "未知";
        const contrabandType = eventType.type === "contraband" ? ["刀具", "液体", "电池", "其他"][Math.floor(Math.random() * 4)] : "无";
        
        events.push({
            id: `EVT-${Date.now()}-${i}`,
            time: time.toLocaleString(),
            device: device.name,
            deviceId: `DEV-${Math.floor(Math.random() * 1000)}`,
            type: eventType.name,
            typeCode: eventType.type,
            status: status,
            processStatus: processStatus,
            passengerId: passengerId,
            contrabandType: contrabandType,
            details: `${eventType.desc}${eventType.type === "contraband" ? `，违禁品类型：${contrabandType}` : ""}${passengerId !== "未知" ? `，人员ID：${passengerId}` : ""}`
        });
    }

    // 按时间倒序排序
    events.sort((a, b) => new Date(b.time) - new Date(a.time));

    // 生成设备数据
    const devices = deviceTypes.map((device, index) => ({
        id: `DEV-${index + 1000}`,
        name: device.name,
        type: device.type,
        ip: device.ip,
        status: deviceStatusMap[device.status],
        location: device.location,
        model: device.model,
        firmware: device.firmware,
        onlineTime: device.onlineTime,
        lastMaintenance: device.lastMaintenance,
        operationCount: Math.floor(Math.random() * 10000) + 1000,
        errorCount: Math.floor(Math.random() * 100)
    }));

    // 生成告警数据
    const alarms = [];
    for (let i = 0; i < 50; i++) {
        const time = new Date(Date.now() - Math.random() * 3600000);
        const levels = ['info', 'warning', 'danger'];
        const level = levels[Math.floor(Math.random() * levels.length)];
        const device = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
        const status = Math.random() > 0.6 ? "已处理" : "未处理";
        const alarmTypes = {
            info: ["系统更新", "数据备份", "设备维护", "系统日志"],
            warning: ["网络延迟", "设备过热", "内存不足", "磁盘空间不足"],
            danger: ["设备离线", "数据丢失", "网络中断", "系统崩溃"]
        };
        const alarmType = alarmTypes[level][Math.floor(Math.random() * alarmTypes[level].length)];
        const operator = status === "已处理" ? [`管理员A`, `管理员B`, `管理员C`][Math.floor(Math.random() * 3)] : "无";
        const handleTime = status === "已处理" ? new Date(time.getTime() + Math.random() * 3600000).toLocaleString() : "无";
        
        alarms.push({
            id: `ALM-${Date.now()}-${i}`,
            time: time.toLocaleString(),
            device: device.name,
            level: level,
            type: alarmType,
            content: `${device.name}发生${alarmType}事件`,
            status: status,
            operator: operator,
            handleTime: handleTime,
            details: `告警ID: ${Math.random().toString(36).substr(2, 9)}，设备IP: ${device.ip}`
        });
    }

    // 生成判图数据
    const judgeItems = [];
    const judgeResults = ["正常", "可疑", "违禁"];
    for (let i = 0; i < 20; i++) {
        const time = new Date(Date.now() - Math.random() * 3600000);
        const device = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
        const statuses = ['待处理', '处理中', '已完成'];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const result = status === "已完成" ? judgeResults[Math.floor(Math.random() * judgeResults.length)] : "无";
        const judgeOperator = status === "已完成" ? [`判图员A`, `判图员B`, `判图员C`][Math.floor(Math.random() * 3)] : "无";
        const judgeTime = status === "已完成" ? new Date(time.getTime() + Math.random() * 300000).toLocaleString() : "无";
        
        judgeItems.push({
            id: `JUD-${Date.now()}-${i}`,
            time: time.toLocaleString(),
            device: device.name,
            deviceId: `DEV-${Math.floor(Math.random() * 1000)}`,
            status: status,
            imageId: `IMG-${Math.floor(Math.random() * 10000)}`,
            imageUrl: `https://picsum.photos/800/400?random=${i}`,
            thumbnailUrl: `https://picsum.photos/200/100?random=${i}`,
            result: result,
            judgeOperator: judgeOperator,
            judgeTime: judgeTime,
            details: `包裹ID: ${Math.random().toString(36).substr(2, 9)}，设备: ${device.name}`
        });
    }

    // 生成配置数据
    const configs = [
        { id: 'CFG-001', name: '安检机灵敏度配置', type: 'device', createTime: '2026-01-10 14:30:00', updateTime: '2026-01-12 09:15:00', description: '配置安检机的检测灵敏度', configDetails: { sensitivity: 85, resolution: 1024, contrast: 70 } },
        { id: 'CFG-002', name: '安检门告警阈值', type: 'device', createTime: '2026-01-08 10:20:00', updateTime: '2026-01-15 16:45:00', description: '配置安检门的告警阈值', configDetails: { threshold: 50, delay: 200, volume: 75 } },
        { id: 'CFG-003', name: '人脸比对参数', type: 'event', createTime: '2026-01-05 08:45:00', updateTime: '2026-01-14 11:30:00', description: '配置人脸比对的参数', configDetails: { confidence: 90, timeout: 5000, retryCount: 3 } },
        { id: 'CFG-004', name: '违禁品数据库', type: 'event', createTime: '2026-01-01 09:00:00', updateTime: '2026-01-16 13:20:00', description: '配置违禁品数据库', configDetails: { version: 'v3.5.2', lastUpdate: '2026-01-16', itemCount: 285 } },
        { id: 'CFG-005', name: '系统告警配置', type: 'system', createTime: '2026-01-03 14:15:00', updateTime: '2026-01-11 10:00:00', description: '配置系统告警参数', configDetails: { email: true, sms: true, sound: true, level: 'warning' } },
        { id: 'CFG-006', name: '温度检测配置', type: 'face', createTime: '2026-01-06 15:40:00', updateTime: '2026-01-13 09:30:00', description: '配置温度检测参数', configDetails: { normalTemp: 36.5, warningTemp: 37.3, errorTemp: 38.0, unit: 'C' } },
        { id: 'CFG-007', name: '网络配置', type: 'system', createTime: '2026-01-02 11:20:00', updateTime: '2026-01-10 14:15:00', description: '配置系统网络参数', configDetails: { ip: '192.168.1.1', subnet: '255.255.255.0', gateway: '192.168.1.254', dns: '8.8.8.8' } },
        { id: 'CFG-008', name: '数据备份配置', type: 'system', createTime: '2026-01-04 16:30:00', updateTime: '2026-01-12 10:45:00', description: '配置数据备份参数', configDetails: { time: '02:00', frequency: 'daily', retention: 30, path: '/backup' } }
    ];

    return { 
        stats, 
        events, 
        devices, 
        alarms, 
        judgeItems,
        configs
    };
}

// 更新时间显示
export function updateTime() {
    const now = new Date();
    const timeDisplay = document.getElementById('currentTime');
    if (timeDisplay) {
        timeDisplay.textContent = now.toLocaleString();
    }
}

// 导航切换功能
export function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const contentDiv = document.querySelector('.content');
    
    if (navItems.length === 0 || !contentDiv) {
        console.error('导航元素或内容容器未找到');
        return;
    }
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const navId = this.dataset.nav;
            
            // 更新导航状态
            navItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            
            // 显示加载状态
            contentDiv.innerHTML = '<div class="loading">加载中...</div>';
            
            // 加载对应的HTML文件
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `/turnkey/smart-security/html/${navId}.html`, true);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        // 替换内容
                        contentDiv.innerHTML = xhr.responseText;
                        
                        // 加载对应的JavaScript
                        loadModuleScript(navId);
                    } else {
                        contentDiv.innerHTML = '<div class="error">加载模块失败</div>';
                        console.error('加载HTML文件失败:', navId);
                    }
                }
            };
            xhr.send();
        });
    });
}

// 加载模块JavaScript
function loadModuleScript(navId) {
    const scriptMap = {
        dashboard: 'js/dashboard.js',
        device: 'js/device.js',
        events: 'js/events.js',
        judge: 'js/judge.js',
        alarm: 'js/alarm.js',
        analysis: 'js/analysis.js',
        config: 'js/config.js'
    };
    
    const scriptSrc = scriptMap[navId];
    if (!scriptSrc) return;
    
    // 检查是否已经加载过该脚本
    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
    if (existingScript) {
        // 如果已经加载过，移除后重新加载
        existingScript.parentNode.removeChild(existingScript);
    }
    
    // 创建并加载脚本
    const script = document.createElement('script');
    script.type = 'module';
    script.src = scriptSrc;
    document.body.appendChild(script);
    
    script.onload = function() {
        console.log('脚本加载完成:', scriptSrc);
        // 脚本加载完成后移除，避免重复加载
        document.body.removeChild(script);
    };
    
    script.onerror = function() {
        console.error('脚本加载失败:', scriptSrc);
    };
}

// 设备切换事件
export function setupDeviceSwitch() {
    const deviceItems = document.querySelectorAll('.device-item');
    deviceItems.forEach(item => {
        item.addEventListener('click', () => {
            // 移除所有活动状态
            deviceItems.forEach(i => i.classList.remove('active'));
            // 添加当前活动状态
            item.classList.add('active');
            // 加载设备详情数据
            const deviceType = item.dataset.device;
            loadDeviceDetail(deviceType);
        });
    });
}

// 绘制简单图表（使用canvas）
export function drawChart(canvasId, title, data, labels, colors) {
    const container = document.getElementById(canvasId);
    if (!container) return;
    
    container.innerHTML = '';
    
    const canvas = document.createElement('canvas');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    
    // 绘制图表逻辑
    const width = canvas.width;
    const height = canvas.height;
    const padding = 50;
    
    // 绘制标题
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 20);
    
    // 绘制坐标轴
    ctx.strokeStyle = '#909399';
    ctx.lineWidth = 1;
    
    // X轴
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Y轴
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.stroke();
    
    // 绘制数据
    if (data.length === 0) return;
    
    const maxValue = Math.max(...data);
    const minValue = Math.min(...data);
    const range = maxValue - minValue || 1;
    
    const barWidth = (width - 2 * padding) / data.length;
    
    // 存储所有条形的位置信息，用于交互
    const bars = [];
    
    // 创建tooltip元素
    let tooltip = document.getElementById('chart-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'chart-tooltip';
        tooltip.style.cssText = `
            position: absolute;
            background-color: rgba(16, 37, 59, 0.9);
            border: 1px solid #409eff;
            border-radius: 4px;
            padding: 8px 12px;
            font-size: 12px;
            color: #ffffff;
            pointer-events: none;
            z-index: 1000;
            display: none;
        `;
        document.body.appendChild(tooltip);
    }
    
    // 绘制所有条形
    data.forEach((value, index) => {
        const barHeight = ((value - minValue) / range) * (height - 2 * padding);
        const x = padding + index * barWidth;
        const y = height - padding - barHeight;
        
        // 存储条形位置信息
        bars.push({
            x: x + 5,
            y: y,
            width: barWidth - 10,
            height: barHeight,
            value: value,
            label: labels ? labels[index] : index,
            color: colors[index % colors.length],
            index: index
        });
        
        // 绘制条形
        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(x + 5, y, barWidth - 10, barHeight);
        
        // 绘制数值
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.fillText(value, x + barWidth / 2, y - 10);
        
        // 绘制标签
        if (labels && labels[index]) {
            ctx.fillStyle = '#909399';
            ctx.font = '11px Microsoft YaHei';
            ctx.fillText(labels[index], x + barWidth / 2, height - padding + 20);
        }
    });
    
    // 处理鼠标移动事件 - 显示tooltip和高亮条形
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        let found = false;
        
        // 检查鼠标是否在某个条形上
        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i];
            if (mouseX >= bar.x && mouseX <= bar.x + bar.width && 
                mouseY >= bar.y && mouseY <= bar.y + bar.height) {
                
                // 高亮当前条形
                ctx.clearRect(0, 0, width, height);
                
                // 重新绘制坐标轴
                ctx.strokeStyle = '#909399';
                ctx.lineWidth = 1;
                
                // X轴
                ctx.beginPath();
                ctx.moveTo(padding, height - padding);
                ctx.lineTo(width - padding, height - padding);
                ctx.stroke();
                
                // Y轴
                ctx.beginPath();
                ctx.moveTo(padding, padding);
                ctx.lineTo(padding, height - padding);
                ctx.stroke();
                
                // 重新绘制所有条形，高亮当前条形
                bars.forEach((bar, index) => {
                    if (index === i) {
                        // 高亮样式
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(bar.x - 2, bar.y - 2, bar.width + 4, bar.height + 4);
                        ctx.fillStyle = bar.color;
                        ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
                    } else {
                        // 普通样式
                        ctx.fillStyle = bar.color;
                        ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
                    }
                    
                    // 重新绘制数值
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '12px Microsoft YaHei';
                    ctx.textAlign = 'center';
                    ctx.fillText(bar.value, bar.x + bar.width / 2, bar.y - 10);
                    
                    // 重新绘制标签
                    if (labels && labels[bar.index]) {
                        ctx.fillStyle = '#909399';
                        ctx.font = '11px Microsoft YaHei';
                        ctx.fillText(labels[bar.index], bar.x + bar.width / 2, height - padding + 20);
                    }
                });
                
                // 显示tooltip
                tooltip.innerHTML = `
                    <div><strong>${bar.label}</strong></div>
                    <div>数值: ${bar.value}</div>
                    <div>占比: ${((bar.value / maxValue) * 100).toFixed(1)}%</div>
                `;
                tooltip.style.left = (e.clientX + 10) + 'px';
                tooltip.style.top = (e.clientY + 10) + 'px';
                tooltip.style.display = 'block';
                
                found = true;
                break;
            }
        }
        
        // 如果鼠标不在任何条形上，恢复正常显示
        if (!found) {
            ctx.clearRect(0, 0, width, height);
            
            // 重新绘制坐标轴
            ctx.strokeStyle = '#909399';
            ctx.lineWidth = 1;
            
            // X轴
            ctx.beginPath();
            ctx.moveTo(padding, height - padding);
            ctx.lineTo(width - padding, height - padding);
            ctx.stroke();
            
            // Y轴
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, height - padding);
            ctx.stroke();
            
            // 重新绘制所有条形
            bars.forEach((bar, index) => {
                ctx.fillStyle = bar.color;
                ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
                
                // 重新绘制数值
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px Microsoft YaHei';
                ctx.textAlign = 'center';
                ctx.fillText(bar.value, bar.x + bar.width / 2, bar.y - 10);
                
                // 重新绘制标签
                if (labels && labels[bar.index]) {
                    ctx.fillStyle = '#909399';
                    ctx.font = '11px Microsoft YaHei';
                    ctx.fillText(labels[bar.index], bar.x + bar.width / 2, height - padding + 20);
                }
            });
            
            // 隐藏tooltip
            tooltip.style.display = 'none';
        }
    });
    
    // 处理鼠标离开事件
    canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
    });
    
    // 处理点击事件 - 筛选功能
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        for (const bar of bars) {
            if (mouseX >= bar.x && mouseX <= bar.x + bar.width && 
                mouseY >= bar.y && mouseY <= bar.y + bar.height) {
                
                // 显示点击反馈
                ctx.clearRect(0, 0, width, height);
                
                // 重新绘制坐标轴
                ctx.strokeStyle = '#909399';
                ctx.lineWidth = 1;
                
                // X轴
                ctx.beginPath();
                ctx.moveTo(padding, height - padding);
                ctx.lineTo(width - padding, height - padding);
                ctx.stroke();
                
                // Y轴
                ctx.beginPath();
                ctx.moveTo(padding, padding);
                ctx.lineTo(padding, height - padding);
                ctx.stroke();
                
                // 重新绘制所有条形，选中的条形使用不同样式
                bars.forEach((b, index) => {
                    if (b.index === bar.index) {
                        // 选中样式
                        ctx.fillStyle = '#409eff';
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2;
                        ctx.fillRect(b.x, b.y, b.width, b.height);
                        ctx.strokeRect(b.x, b.y, b.width, b.height);
                    } else {
                        // 未选中样式（半透明）
                        ctx.fillStyle = b.color + '80';
                        ctx.fillRect(b.x, b.y, b.width, b.height);
                    }
                    
                    // 重新绘制数值
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '12px Microsoft YaHei';
                    ctx.textAlign = 'center';
                    ctx.fillText(b.value, b.x + b.width / 2, b.y - 10);
                    
                    // 重新绘制标签
                    if (labels && labels[b.index]) {
                        ctx.fillStyle = '#909399';
                        ctx.font = '11px Microsoft YaHei';
                        ctx.fillText(labels[b.index], b.x + b.width / 2, height - padding + 20);
                    }
                });
                
                // 模拟筛选功能
                console.log('筛选条件:', bar.label, bar.value);
                alert(`已筛选: ${bar.label} (${bar.value})`);
                
                break;
            }
        }
    });
}

// 响应式处理
window.addEventListener('resize', () => {
    // 重新绘制所有图表
    const data = generateMockData();
    renderCharts(data);
});

// 移动端导航功能
export function setupMobileNavigation() {
    const mobileNavBtn = document.getElementById('mobileNavBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('overlay');
    
    if (!mobileNavBtn || !sidebar || !overlay) return;
    
    // 点击移动端导航按钮
    mobileNavBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    });
    
    // 点击遮罩层
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 设置时间更新
    updateTime();
    setInterval(updateTime, 1000);
    
    // 设置导航功能
    setupNavigation();
    
    // 设置设备切换
    setupDeviceSwitch();
    
    // 初始化移动端导航
    setupMobileNavigation();
    
    // 初始数据加载（只加载首页数据）
    // 直接加载首页HTML
    loadInitialDashboard();
});

// 加载初始首页
function loadInitialDashboard() {
    console.log('Loading initial dashboard...');
    const contentDiv = document.querySelector('.content');
    if (!contentDiv) return;
    
    // 显示加载状态
    contentDiv.innerHTML = '<div class="loading">加载中...</div>';
    
    // 使用XMLHttpRequest加载首页HTML文件
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'html/dashboard.html', true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                // 替换内容
                contentDiv.innerHTML = xhr.responseText;
                
                // 加载首页JavaScript
                const script = document.createElement('script');
                script.type = 'module';
                script.src = 'js/dashboard.js';
                document.body.appendChild(script);
                script.onload = () => {
                    // 脚本加载完成后移除，避免重复加载
                    document.body.removeChild(script);
                };
                script.onerror = function() {
                    console.error('加载首页脚本失败');
                };
            } else {
                contentDiv.innerHTML = '<div class="error">加载首页失败</div>';
                console.error('加载首页HTML失败:', xhr.status);
            }
        }
    };
    xhr.send();
}

// 以下函数需要在具体模块中实现或扩展