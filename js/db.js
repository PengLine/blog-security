/**
 * 全系统统一业务数据中枢（单例 Store）
 *
 * 业务链路：旅客建档 → 人脸/人证核验 → 人包绑定 → X光/门过检 → AI 预判
 *          → 人工集中判图 → 处置（放行/复检/查扣）→ 查扣登记 → 民警交接
 *
 * 所有模块通过 getStore() 读写同一份数据，判图/处置/处理告警等
 * 操作会实时联动首页统计、事件中心、告警中心、统计分析等页面。
 * 数据挂载在 window.__SECURITY_STORE__，防止模块重复加载导致重置。
 */

// ---------- 基础工具 ----------
function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTime(ts) {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtDateTime(ts) {
    return `${fmtDate(ts)} ${fmtTime(ts)}`;
}

// 会话内稳定随机数（首次生成后不再变化）
let seq = { evt: 0, bag: 0, emp: 0, alm: 0, ho: 0, rec: 0, enr: 0 };

// ---------- 静态字典 ----------
export const CONTRABAND_TYPES = [
    { name: '刀具', level: 'severe', color: '#f56c6c', items: ['水果刀', '匕首', '裁纸刀', '修眉刀'] },
    { name: '液体', level: 'restricted', color: '#409eff', items: ['发胶', '指甲油', '白酒(超量)', '汽油样品'] },
    { name: '易燃易爆', level: 'severe', color: '#e6a23c', items: ['打火机(超量)', '烟花爆竹', '酒精(超量)', '压缩气罐'] },
    { name: '电池/充电宝', level: 'restricted', color: '#722ed1', items: ['超规充电宝', '锂电池(散装)', '焊锡电池'] },
    { name: '钝器/工具', level: 'restricted', color: '#909399', items: ['锤子', '棍棒', '扳手'] }
];

export const ROLES = ['判图员', '值机安检员', '复检员', '值班队长'];

const SURNAMES = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '胡', '朱', '郭', '何', '林', '高', '罗'];
const GIVEN = ['伟', '芳', '娜', '敏', '静', '磊', '强', '洋', '勇', '艳', '杰', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '文'];

// 员工：集中判图、处置交接、告警处理的操作人来源
function makeEmployees() {
    const staff = [
        { name: '刘晓芸', role: '判图员', team: '甲班' },
        { name: '赵建国', role: '判图员', team: '甲班' },
        { name: '孙雅雯', role: '判图员', team: '乙班' },
        { name: '马文昭', role: '判图员', team: '乙班' },
        { name: '陈立峰', role: '值机安检员', team: '甲班' },
        { name: '周雨桐', role: '值机安检员', team: '甲班' },
        { name: '吴国强', role: '值机安检员', team: '乙班' },
        { name: '何秀兰', role: '复检员', team: '甲班' },
        { name: '徐宗翰', role: '复检员', team: '乙班' },
        { name: '王振宇', role: '值班队长', team: '甲班' },
        { name: '李慧芝', role: '值班队长', team: '乙班' }
    ];
    return staff.map((s, i) => ({
        id: `EMP-${String(1001 + i)}`,
        name: s.name,
        role: s.role,
        team: s.team,
        civilNo: `JWT${String(320 + i)}`,
        onDuty: true
    }));
}

// ---------- 设备与通道 ----------
const DEVICE_TEMPLATES = [
    { key: 'securityCheckMachine', name: '安检机', category: '核心设备', model: 'X-Ray-500', base: 'iSDD-1200' },
    { key: 'recheckTable', name: '复检台', category: '核心设备', model: 'Recheck-200', base: 'RCH-860' },
    { key: 'metalDoor', name: '金属门', category: '安检门', model: 'Metal-Door-3000', base: 'MD-Z2' },
    { key: 'millimeterWaveDoor', name: '毫米波门', category: '安检门', model: 'MMW-Door-5000', base: 'MW-T3' },
    { key: 'antiTheftDoor', name: '防损门', category: '安检门', model: 'AntiTheft-1000', base: 'AT-E1' },
    { key: 'classificationDoor', name: '分类门', category: '安检门', model: 'Classify-2000', base: 'CL-V5' },
    { key: 'accessControl', name: '门禁设备', category: '明眸设备', model: 'Access-4000', base: 'AC-MC2' },
    { key: 'accessVideo', name: '门禁视频一体机', category: '明眸设备', model: 'Access-Video-6000', base: 'AV-VC8' },
    { key: 'personCertCompare', name: '人证对比', category: '明眸设备', model: 'Face-Compare-7000', base: 'FC-PRO' },
    { key: 'explosiveDetector', name: '炸探', category: '探测设备', model: 'Explosive-Detector-8000', base: 'EX-IMS' },
    { key: 'liquidDetector', name: '液探', category: '探测设备', model: 'Liquid-Detector-9000', base: 'LD-SCA' }
];

const DEVICE_STATUS_PATTERN = { 2: 'warning', 4: 'offline', 8: 'warning' }; // 毫米波门告警 / 4号分类门离线 / 8号门禁视频告警

function makeDevices() {
    const devices = [];
    for (let ch = 1; ch <= 6; ch++) {
        DEVICE_TEMPLATES.forEach((tpl, ti) => {
            const idx = (ch - 1) * DEVICE_TEMPLATES.length + ti;
            const status = DEVICE_STATUS_PATTERN[ch] && ti === (ch === 2 ? 3 : ch === 4 ? 5 : 7) ? 'warning' : 'online';
            devices.push({
                id: `DEV-${1000 + idx}`,
                key: tpl.key,
                name: `${tpl.name}${pad(ch)}-0${ti + 1}`,
                displayName: `${ch}号通道${tpl.name}`,
                category: tpl.category,
                type: tpl.category === '核心设备' ? 'security' : (tpl.category === '探测设备' ? 'detection' : 'access'),
                ip: `192.168.${ch}.${100 + ti + 1}`,
                status,
                location: `${ch}号通道`,
                channel: `CH-${ch}`,
                model: `${tpl.base}-${tpl.model}`,
                firmware: `v${2 + (ti % 3)}.${ti % 6}.${(idx % 5) + 1}`,
                serialNumber: `SN${new Date().getFullYear() - 1}${pad(ch)}${pad(ti + 1)}${String(idx).padStart(3, '0')}`,
                onlineTime: fmtDateTime(Date.now() - (3600000 * 24 * 30 + idx * 60000)),
                lastMaintenance: fmtDate(Date.now() - (7 + ti * 3) * 86400000),
                nextMaintenance: fmtDate(Date.now() + (83 - ti * 3) * 86400000),
                operationCount: 8000 + idx * 137 + Math.floor(Math.random() * 5000),
                errorCount: status === 'online' ? Math.floor(Math.random() * 8) : Math.floor(Math.random() * 30) + 10
            });
        });
    }
    // 6号通道分类门整体离线（沿用原型的离线设定）
    devices.forEach(d => {
        if (d.channel === 'CH-6' && d.key === 'classificationDoor') d.status = 'offline';
        if (d.channel === 'CH-4' && d.key === 'millimeterWaveDoor') d.status = 'warning';
    });
    return devices;
}

// ---------- 旅客与员工 ----------
function makePassengers(todayStart) {
    const list = [];
    for (let i = 0; i < 180; i++) {
        const gender = Math.random() > 0.48 ? '男' : '女';
        const birthYear = 1955 + Math.floor(Math.random() * 55);
        const m = 1 + Math.floor(Math.random() * 12), d = 1 + Math.floor(Math.random() * 28);
        const idCard = `11010${1 + Math.floor(Math.random() * 8)}${birthYear}${pad(m)}${pad(d)}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        const deptRoll = Math.random();
        list.push({
            id: `P-${fmtDate(todayStart).replace(/-/g, '')}-${pad(Math.floor(i / 5) + 1)}${String(i % 5).padStart(1, '')}`,
            name: SURNAMES[Math.floor(Math.random() * SURNAMES.length)] + GIVEN[Math.floor(Math.random() * GIVEN.length)],
            gender,
            age: new Date().getFullYear() - birthYear,
            idCard,
            phone: `1${3 + Math.floor(Math.random() * 6)}${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
            department: deptRoll > 0.93 ? 'VIP' : (deptRoll > 0.88 ? '工作人员' : '普通乘客'),
            faceEnrolled: Math.random() > 0.12,
            temperature: +(36.1 + Math.random() * 1.4 + (Math.random() > 0.96 ? 1.5 : 0)).toFixed(1),
            checkInTime: fmtDateTime(todayStart + Math.random() * (Date.now() - todayStart)),
            _ts: todayStart + Math.random() * (Date.now() - todayStart)
        });
    }
    list.sort((a, b) => b._ts - a._ts);
    list.forEach((p, i) => { p.id = `P-${fmtDate(todayStart).replace(/-/g, '')}-${String(1000 + i)}`; });
    return list;
}

// ---------- 包裹与判图闭环 ----------
// 生命周期：scanned(AI预判) → pending(待人工判图) → judged(已处置)
function makeBags(passengers, devices, employees, todayStart) {
    const bags = [];
    const machines = devices.filter(d => d.key === 'securityCheckMachine');
    const judges = employees.filter(e => e.role === '判图员');
    const now = Date.now();
    const span = now - todayStart;

    for (let i = 0; i < 540; i++) {
        // 扫描时间：按客流高峰（8-11 / 14-17）加权分布在营业时间内
        let scanTs;
        const r = Math.random();
        if (r < 0.7) {
            const peak = Math.random() > 0.5 ? 9 : 15;
            scanTs = todayStart + (peak - 2 + Math.random() * 6) * 3600000;
        } else {
            scanTs = todayStart + Math.random() * span;
        }
        scanTs = Math.min(scanTs, now - 60000);
        const passenger = passengers[Math.floor(Math.random() * passengers.length)];
        const machine = machines[Math.floor(Math.random() * machines.length)];
        const weight = +(0.4 + Math.random() * 13).toFixed(1);

        // AI 预判：约 82% 直接正常放行，其余进入人工判图队列
        const roll = Math.random();
        let ai = null;
        if (roll > 0.82) {
            const ct = CONTRABAND_TYPES[Math.floor(Math.random() * CONTRABAND_TYPES.length)];
            const kind = roll > 0.965 ? '违禁' : (roll > 0.90 ? '可疑' : '正常');
            ai = { label: kind === '违禁' ? ct.name : (kind === '可疑' ? ct.name : '疑似' + ct.name), type: ct.name, level: ct.level, confidence: +(kind === '违禁' ? 90 + Math.random() * 9 : kind === '可疑' ? 76 + Math.random() * 14 : 60 + Math.random() * 18).toFixed(1) };
        }

        const bag = {
            id: `PKG-${fmtDate(scanTs).replace(/-/g, '')}-${String(20000 + seq.bag++)}`,
            owner: passenger.id,
            ownerName: passenger.name,
            channel: machine.channel,
            channelName: machine.location,
            machine: machine.id,
            machineName: machine.displayName,
            scanTs,
            scanTime: fmtDateTime(scanTs),
            weightKg: weight,
            imageSeed: Math.floor(Math.random() * 100000),
            bindingStatus: '已绑定',
            ai
        };

        if (!ai) {
            bag.status = 'pass';
            bag.judgeResult = '正常';
            bag.disposition = '放行';
        } else if (scanTs > now - 25 * 60000 && Math.random() > 0.35) {
            // 最新过检的 AI  flagged 包裹：仍在人工判图队列中
            bag.status = 'pending';
        } else {
            finalizeBag(bag, judges, now, true);
        }
        bags.push(bag);
    }
    bags.sort((a, b) => b.scanTs - a.scanTs);
    return bags;
}

// 人工判图 + 处置（生成查扣登记所需的原始数据）
function finalizeBag(bag, judges, now, generated) {
    const isReal = bag.ai && (bag.ai.label === bag.ai.type); // AI 报违禁 vs 疑似
    const m = 15 + Math.floor(Math.random() * 200);
    const judgeTs = Math.min(bag.scanTs + m * 60000, now - 30000);
    const judge = judges[Math.floor(Math.random() * judges.length)];

    // 人工判图结果：以 AI 为参考，允许纠错
    let result;
    if (!bag.ai) result = '正常';
    else if (bag.ai.label === '疑似' + bag.ai.type) result = Math.random() > 0.55 ? '正常' : (Math.random() > 0.4 ? '可疑' : '违禁');
    else if (bag.ai.label === bag.ai.type) result = Math.random() > 0.18 ? '违禁' : '可疑';
    else result = Math.random() > 0.5 ? '可疑' : '正常';

    bag.status = 'judged';
    bag.judgeResult = result;
    bag.judgeOperator = judge.name;
    bag.judgeOperatorId = judge.id;
    bag.judgeTs = judgeTs;
    bag.judgeTime = fmtDateTime(judgeTs);
    bag.reviewDelayMin = m;

    if (result === '正常') {
        bag.disposition = '放行';
        bag.aiCorrect = bag.ai.label.startsWith('疑似');
    } else if (result === '可疑') {
        bag.disposition = Math.random() > 0.45 ? '复检放行' : '开包查扣';
    } else {
        bag.disposition = '开包查扣';
        const ct = CONTRABAND_TYPES.find(c => c.name === bag.ai.type);
        bag.seized = {
            typeName: bag.ai.type,
            level: ct.level,
            itemName: ct.items[Math.floor(Math.random() * ct.items.length)],
            qty: ct.level === 'restricted' ? 1 + Math.floor(Math.random() * 3) : 1,
            unit: bag.ai.type === '液体' ? '瓶' : (bag.ai.type === '刀具' ? '把' : bag.ai.type === '电池/充电宝' ? '个' : '件')
        };
    }
    return bag;
}

// ---------- 处置交接（查扣 → 民警） ----------
function makeHandoffs(bags, employees) {
    const onDutyPolice = ['民警·郑志强 (JWT356)', '民警·沙澜 (JWT361)', '民警·崔保国 (JWT344)'];
    const posts = ['1号安检值机台', '2号安检值机台', '集中判图室', '复检台', '候车厅巡逻岗'];
    const list = [];
    bags.filter(b => b.disposition === '开包查扣' || b.disposition === '查扣').forEach(bag => {
        const seized = bag.seized || { typeName: '其他', level: 'restricted', itemName: '受限物品', qty: 1, unit: '件' };
        const ts = (bag.judgeTs || bag.scanTs) + 60000 * (3 + Math.floor(Math.random() * 12));
        const handler = employees.find(e => e.id === bag.judgeOperatorId) || employees[0];
        const ageMin = (Date.now() - ts) / 60000;
        let status;
        if (ageMin > 90) status = Math.random() > 0.07 ? '已完成' : '待移交';
        else if (ageMin > 25) status = Math.random() > 0.4 ? '已完成' : '移交中';
        else status = Math.random() > 0.6 ? '移交中' : '待移交';

        list.push({
            id: `HO-${fmtDate(ts).replace(/-/g, '')}-${String(500 + seq.ho++)}`,
            bagId: bag.id,
            passengerName: bag.ownerName,
            passengerId: bag.owner,
            channel: bag.channelName,
            machineName: bag.machineName,
            typeName: seized.itemName ? `${seized.typeName}·${seized.itemName}` : seized.typeName,
            category: seized.typeName,
            level: seized.level,
            qty: seized.qty,
            unit: seized.unit,
            foundWay: 'X光判图',
            foundBy: handler.name,
            foundByRole: handler.role,
            ts,
            time: fmtDateTime(ts),
            status,
            toPost: posts[Math.floor(Math.random() * posts.length)],
            police: onDutyPolice[Math.floor(Math.random() * onDutyPolice.length)],
            storageNo: `CC${fmtDate(ts).replace(/-/g, '').slice(2)}${String(1000 + Math.floor(Math.random() * 8999))}`,
            note: seized.level === 'severe' ? '属禁止携带物品，已依规收缴' : '属限制携带物品，旅客自愿放弃交接'
        });
    });
    list.sort((a, b) => b.ts - a.ts);
    return list;
}

// ---------- 事件中心 ----------
function makeEvents(bags, passengers, devices, todayStart) {
    const list = [];
    const push = (ts, deviceName, type, statusName, detail, extra) => {
        const time = fmtDateTime(ts);
        list.push(Object.assign({
            id: `EVT-${fmtDate(ts).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
            time, _ts: ts, device: deviceName, type,
            status: { normal: 'status-normal', warning: 'status-warning', danger: 'status-danger', processing: 'status-processing' }[statusName],
            statusName,
            processStatus: ts < Date.now() - 40 * 60000 ? (Math.random() > 0.2 ? '已处理' : '未处理') : (Math.random() > 0.7 ? '处理中' : '未处理'),
            details: detail
        }, extra || {}));
    };

    // 1) 旅客过检事件（人证/人脸/温度）
    passengers.slice(0, 120).forEach(p => {
        if (p.temperature > 37.3) {
            push(p._ts, `${p.department === '工作人员' ? '人证对比' : '毫米波门'}·${p.channel || 'CH-1'}人`, '温度异常', 'warning',
                `旅客 ${p.name} 体温 ${p.temperature}℃，超过阈值 37.3℃，已引导至复测区`, { passengerId: p.id });
        } else if (!p.faceEnrolled && Math.random() > 0.5) {
            push(p._ts, '人证对比设备', '未注册', 'warning', `旅客 ${p.name} 未注册人脸信息，转人工核验`, { passengerId: p.id });
        } else if (Math.random() > 0.86) {
            push(p._ts, '门禁视频一体机', '未刷脸', 'warning', `旅客 ${p.name} 通行时未进行人脸识别`, { passengerId: p.id });
        } else {
            push(p._ts, '安检通道', '正常通过', 'normal', `旅客 ${p.name} 完成人证核验，正常通行`, { passengerId: p.id });
        }
    });

    // 2) 包裹判图/处置事件
    bags.forEach(bag => {
        if (bag.status === 'pending') {
            push(bag.scanTs, bag.machineName, '集中判图', 'processing', `AI 标记「${bag.ai ? bag.ai.label : ''}」(${bag.ai ? bag.ai.confidence : '-'}%)，等待人工判图`, { passengerId: bag.owner, type: '判图待处理' });
        } else if (bag.judgeResult === '违禁') {
            push(bag.judgeTs, bag.machineName, '违禁品检测', 'danger', `${bag.ownerName} 的包裹 ${bag.id} 检出${bag.seized.itemName}，已开包查扣`, { passengerId: bag.owner });
        } else if (bag.judgeResult === '可疑') {
            push(bag.judgeTs, bag.machineName, '包裹异常', 'warning', `${bag.ownerName} 的包裹 ${bag.id} 图像可疑，转${bag.disposition === '复检放行' ? '复检' : '开包检查'}`, { passengerId: bag.owner });
        } else if (bag.ai) {
            push(bag.judgeTs, bag.machineName, '金属检测', 'normal', `AI 疑似标记经人工复核为正常（金属遮挡），${bag.ownerName} 的包裹放行`, { passengerId: bag.owner });
        }
    });

    // 3) 设备/系统事件
    devices.filter(d => d.status !== 'online').forEach(d => {
        push(Date.now() - Math.random() * 5 * 3600000, d.displayName, d.status === 'offline' ? '设备离线' : '网络异常', d.status === 'offline' ? 'danger' : 'warning',
            d.status === 'offline' ? `${d.displayName}(${d.ip}) 心跳超时，已离线` : `${d.displayName} 网络延迟 ${80 + Math.floor(Math.random() * 300)}ms，链路不稳定`);
    });
    push(Date.now() - 26 * 3600000, '系统平台', '数据备份', 'normal', '每日增量备份完成，耗时 8 分 12 秒');
    push(Date.now() - 22 * 3600000, '3号通道金属门', '系统重启', 'normal', '计划内固件升级后自动重启，服务已恢复');

    list.sort((a, b) => b._ts - a._ts);
    return list;
}

// ---------- 告警中心 ----------
function makeAlarms(bags, devices, employees) {
    const list = [];
    const now = Date.now();

    // 高危：违禁品查扣告警
    bags.filter(b => b.judgeResult === '违禁').slice(0, 18).forEach(bag => {
        const handled = (now - bag.judgeTs) / 60000 > 45;
        list.push({
            id: `ALM-${fmtDate(bag.judgeTs).replace(/-/g, '')}-${String(3000 + seq.alm++)}`,
            ts: bag.judgeTs, time: fmtDateTime(bag.judgeTs),
            device: bag.machineName, level: 'danger', type: '违禁品检出',
            content: `${bag.ownerName} 的包裹 ${bag.id} 检出${bag.seized.itemName}（${bag.seized.typeName}）`,
            status: handled ? '已处理' : '未处理',
            operator: handled ? '值班队长·王振宇' : '',
            handleTime: handled ? fmtDateTime(bag.judgeTs + 60000 * (5 + Math.random() * 20)) : '',
            refId: bag.id,
            details: `判图依据：X光双视角图像，AI 置信度 ${bag.ai.confidence}%；处置：开包查扣`
        });
    });

    // 设备类告警
    devices.filter(d => d.status !== 'online').forEach(d => {
        const ts = now - Math.random() * 4 * 3600000;
        list.push({
            id: `ALM-${fmtDate(ts).replace(/-/g, '')}-${String(3000 + seq.alm++)}`,
            ts, time: fmtDateTime(ts), device: d.displayName,
            level: d.status === 'offline' ? 'danger' : 'warning',
            type: d.status === 'offline' ? '设备离线' : '设备过热',
            content: d.status === 'offline' ? `${d.displayName}(${d.ip}) 心跳丢失，判定离线` : `${d.displayName} 机身温度 46℃，超过告警阈值 42℃`,
            status: '未处理', operator: '', handleTime: '',
            details: `最近维护：${d.lastMaintenance}，累计告警 ${d.errorCount} 次，建议现场检查供电与网口`
        });
    });

    // 系统类告警
    const sysAlarms = [
        { level: 'warning', type: '磁盘空间不足', device: '判图服务器-01', content: '图像存储分区使用率 87%，预计 9 天后写满', status: '未处理' },
        { level: 'warning', type: '网络延迟', device: '核心交换机', content: '安检专网平均延迟 68ms，波动增大', status: '已处理' },
        { level: 'info', type: '系统更新', device: '系统平台', content: '判图辅助算法升级至 v3.5.2，新增锂电池细分识别', status: '已处理' },
        { level: 'info', type: '设备维护', device: '1号通道安检机', content: '按月完成传送带保养与铅门检查', status: '已处理' },
        { level: 'info', type: '数据备份', device: '系统平台', content: '每日增量备份完成', status: '已处理' }
    ];
    sysAlarms.forEach(s => {
        const ts = now - Math.random() * 10 * 3600000;
        list.push({
            id: `ALM-${fmtDate(ts).replace(/-/g, '')}-${String(3000 + seq.alm++)}`,
            ts, time: fmtDateTime(ts), device: s.device, level: s.level, type: s.type, content: s.content,
            status: s.status,
            operator: s.status === '已处理' ? `值班队长·${['王振宇', '李慧芝'][Math.floor(Math.random() * 2)]}` : '',
            handleTime: s.status === '已处理' ? fmtDateTime(ts + 60000 * (10 + Math.random() * 60)) : '',
            details: '系统自动生成的运维类告警'
        });
    });

    list.sort((a, b) => b.ts - a.ts);
    return list;
}

// ---------- 人脸识别数据（与旅客库打通） ----------
function makeFaceData(passengers, devices) {
    const enrollHistory = [];
    passengers.filter(p => p.faceEnrolled).slice(0, 60).forEach(p => {
        const ts = p._ts - Math.random() * 30 * 86400000;
        enrollHistory.push({
            id: `ENR-${fmtDate(ts).replace(/-/g, '')}-${String(200 + seq.enr++)}`,
            time: fmtDateTime(ts), ts, personId: p.id, personName: p.name,
            method: Math.random() > 0.4 ? '摄像头' : '上传图片',
            status: Math.random() > 0.06 ? '成功' : '失败',
            similarity: (88 + Math.random() * 11).toFixed(1),
            operator: '值机安检员·陈立峰'
        });
    });

    const recognitionRecords = [];
    passengers.slice(0, 90).forEach(p => {
        const chDevices = devices.filter(d => d.category === '明眸设备');
        const dev = chDevices[Math.floor(Math.random() * chDevices.length)];
        const success = p.faceEnrolled && Math.random() > 0.09;
        recognitionRecords.push({
            id: `REC-${fmtDate(p._ts).replace(/-/g, '')}-${String(4000 + seq.rec++)}`,
            time: fmtDateTime(p._ts), ts: p._ts,
            personId: success ? p.id : '未知', personName: success ? p.name : '未知',
            device: dev.displayName, channel: dev.location,
            similarity: success ? (86 + Math.random() * 13).toFixed(1) : '0.0',
            status: success ? '识别成功' : '未识别',
            temperature: p.temperature
        });
    });
    recognitionRecords.sort((a, b) => b.ts - a.ts);
    return { enrollHistory, recognitionRecords };
}

// ---------- 通道实时状态 ----------
function makeChannels(devices) {
    const chs = [];
    for (let i = 1; i <= 6; i++) {
        const devs = devices.filter(d => d.channel === `CH-${i}`);
        const worst = devs.some(d => d.status === 'offline') ? 'closed' : (devs.some(d => d.status === 'warning') ? 'busy' : 'open');
        chs.push({
            id: `CH-${i}`, name: `${i}号通道`,
            status: i === 6 ? 'closed' : worst,
            devices: devs.map(d => d.id),
            throughputToday: 0, queue: Math.floor(Math.random() * 12), waitMin: 0
        });
    }
    return chs;
}

// ---------- 配置管理（含违禁品名录） ----------
function makeConfigs() {
    return [
        { id: 'CFG-001', name: '安检机灵敏度配置', type: 'device', scope: '全部安检机', createTime: '2026-09-10 14:30:00', updateTime: '2026-10-12 09:15:00', description: 'X光机射线剂量与图像增强等级', configDetails: { 灵敏度: 85, 分辨率: 1024, 对比度: 70, 穿透阈值_mm: 38 } },
        { id: 'CFG-002', name: '安检门告警阈值', type: 'device', scope: '金属门/毫米波门', createTime: '2026-09-08 10:20:00', updateTime: '2026-10-15 16:45:00', description: '门区金属/毫米波信号告警触发条件', configDetails: { 金属阈值: 50, 分区数: 18, 灵敏度曲线: '均匀区高灵敏度', 语音播报: true } },
        { id: 'CFG-003', name: '人脸比对参数', type: 'event', scope: '明眸设备', createTime: '2026-09-05 08:45:00', updateTime: '2026-10-14 11:30:00', description: '1:1 人证比对与 1:N 检索阈值', configDetails: { 通过阈值: 90, 复审阈值: 75, 超时_ms: 5000, 重搜次数: 3 } },
        { id: 'CFG-004', name: '违禁品数据库', type: 'event', scope: '集中判图', createTime: '2026-09-01 09:00:00', updateTime: fmtDateTime(Date.now() - 2 * 86400000), description: '判图辅助识别库（与处置交接页联动）', configDetails: { 版本: 'v3.5.2', 条目数: CONTRABAND_TYPES.reduce((s, c) => s + c.items.length, 0) + 280, 禁止类: CONTRABAND_TYPES.filter(c => c.level === 'severe').map(c => c.name).join('/'), 限制类: CONTRABAND_TYPES.filter(c => c.level === 'restricted').map(c => c.name).join('/') } },
        { id: 'CFG-005', name: '系统告警配置', type: 'system', scope: '全局', createTime: '2026-09-03 14:15:00', updateTime: '2026-10-11 10:00:00', description: '告警推送渠道与升级策略', configDetails: { 弹窗: true, 短信: true, 语音: true, 升级策略: '危险级15分钟未处理升级值班队长' } },
        { id: 'CFG-006', name: '体温检测配置', type: 'face', scope: '通道测温', createTime: '2026-09-06 15:40:00', updateTime: '2026-10-13 09:30:00', description: '红外测温报警阈值', configDetails: { 正常上限: 37.3, 报警上限: 38.0, 复测次数: 2, 单位: '℃' } },
        { id: 'CFG-007', name: '网络配置', type: 'system', scope: '平台侧', createTime: '2026-09-02 11:20:00', updateTime: '2026-10-10 14:15:00', description: '安检专网地址规划', configDetails: { ip: '192.168.1.1', subnet: '255.255.255.0', gateway: '192.168.1.254', dns: '192.168.1.53' } },
        { id: 'CFG-008', name: '数据备份配置', type: 'system', scope: '平台侧', createTime: '2026-09-04 16:30:00', updateTime: '2026-10-12 10:45:00', description: '图像与业务库备份策略', configDetails: { 时间: '02:00', 频率: '每日', 保留天数: 30, 路径: '/backup' } }
    ];
}

// ---------- 聚合统计 ----------
export function aggregate(store) {
    const { bags, passengers, devices, alarms, events, channels, handoffs } = store;
    const online = devices.filter(d => d.status === 'online').length;
    const scanned = bags.length;
    const pendingJudge = bags.filter(b => b.status === 'pending').length;
    const judged = bags.filter(b => b.status === 'judged');
    const seized = bags.filter(b => b.disposition === '开包查扣').length;
    const aiMarked = bags.filter(b => b.ai).length;
    const falseAlarm = judged.filter(b => b.ai && b.judgeResult === '正常').length;
    const unhandled = alarms.filter(a => a.status === '未处理').length;
    const processedEvents = events.filter(e => e.processStatus === '已处理').length;

    channels.forEach(c => { c.throughputToday = bags.filter(b => b.channel === c.id).length + passengers.filter(p => (p.channel || '') === c.id).length; });

    // 小时序列（8 点 - 当前小时）
    const baseHour = 8, now = new Date();
    const hours = [];
    for (let h = baseHour; h <= now.getHours(); h++) hours.push(h);
    const flowSeries = hours.map(h => bags.filter(b => new Date(b.scanTs).getHours() === h).length);
    const seizeSeries = hours.map(h => bags.filter(b => (b.judgeTs || b.scanTs) && new Date(b.judgeTs || b.scanTs).getHours() === h && b.judgeResult === '违禁').length);

    return {
        cards: [
            { title: '今日客流', value: passengers.length, trend: 'up', change: 12.5 },
            { title: '过检包裹', value: scanned, trend: 'up', change: 8.2 },
            { title: '待判图', value: pendingJudge, trend: pendingJudge > 8 ? 'up' : 'down', change: 0 },
            { title: '违禁品查获', value: seized, trend: 'up', change: 5.1 },
            { title: '未处理告警', value: unhandled, trend: unhandled > 5 ? 'up' : 'down', change: 0 },
            { title: '设备在线率', value: `${(online / devices.length * 100).toFixed(1)}%`, trend: 'up', change: 0.5 },
            { title: '人工判图率', value: `${(aiMarked / scanned * 100).toFixed(1)}%`, trend: 'down', change: 3.4 },
            { title: 'AI 误报率', value: `${(falseAlarm / (aiMarked || 1) * 100).toFixed(1)}%`, trend: 'down', change: 2.2 }
        ],
        hours, flowSeries, seizeSeries,
        seized, scanned, pendingJudge, unhandled,
        eventProcessRate: events.length ? (processedEvents / events.length * 100).toFixed(1) : '0.0',
        deviceStatus: { online, warning: devices.filter(d => d.status === 'warning').length, offline: devices.filter(d => d.status === 'offline').length },
        contrabandByType: CONTRABAND_TYPES.map(c => ({ name: c.name, color: c.color, value: handoffs.filter(h => h.category === c.name).length })).filter(x => x.value > 0),
        eventTypeStats: (() => {
            const map = {};
            events.forEach(e => { map[e.type] = (map[e.type] || 0) + 1; });
            return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
        })(),
        hourlyTable: hours.slice().reverse().map(h => ({
            time: `${pad(h)}:00 - ${pad((h + 2) % 24)}:00`,
            flow: bags.filter(b => new Date(b.scanTs).getHours() === h).length,
            contraband: bags.filter(b => b.judgeResult === '违禁' && new Date(b.judgeTs || 0).getHours() === h).length,
            alarms: alarms.filter(a => new Date(a.ts).getHours() === h).length,
            onlineDevices: online
        }))
    };
}

// ---------- 业务动作（写操作，全系统联动） ----------
export function judgeBag(bagId, result, operatorName) {
    const store = getStore();
    const bag = store.bags.find(b => b.id === bagId);
    if (!bag) return null;
    const now = Date.now();
    const judge = store.employees.find(e => e.name === operatorName) || store.employees[0];
    bag.status = 'judged';
    bag.judgeResult = result;
    bag.judgeOperator = operatorName;
    bag.judgeOperatorId = judge.id;
    bag.judgeTs = now;
    bag.judgeTime = fmtDateTime(now);

    if (result === '正常') {
        bag.disposition = '放行';
    } else if (result === '可疑') {
        bag.disposition = '转复检';
    } else {
        // 违禁：默认按 AI 识别品类生成查扣明细，交接页可修改
        const ct = CONTRABAND_TYPES.find(c => c.name === (bag.ai ? bag.ai.type : '')) || CONTRABAND_TYPES[CONTRABAND_TYPES.length - 1];
        bag.seized = { typeName: ct.name, level: ct.level, itemName: ct.items[0], qty: 1, unit: '件' };
        bag.disposition = '开包查扣';
        const ho = {
            id: `HO-${fmtDate(now).replace(/-/g, '')}-${String(500 + seq.ho++)}`,
            bagId: bag.id, passengerName: bag.ownerName, passengerId: bag.owner,
            channel: bag.channelName, machineName: bag.machineName,
            typeName: `${ct.name}·${ct.items[0]}`, category: ct.name, level: ct.level,
            qty: 1, unit: '件', foundWay: 'X光判图', foundBy: operatorName, foundByRole: judge.role,
            ts: now, time: fmtDateTime(now), status: '待移交',
            toPost: '集中判图室', police: '', storageNo: `CC${fmtDate(now).replace(/-/g, '').slice(2)}${String(1000 + Math.floor(Math.random() * 8999))}`,
            note: '判图员确认为违禁品，待开包登记'
        };
        store.handoffs.unshift(ho);
        store.alarms.unshift({
            id: `ALM-${fmtDate(now).replace(/-/g, '')}-${String(3000 + seq.alm++)}`,
            ts: now, time: fmtDateTime(now), device: bag.machineName, level: 'danger', type: '违禁品检出',
            content: `${bag.ownerName} 的包裹 ${bag.id} 经人工判图确认违禁：${ho.typeName}`,
            status: '未处理', operator: '', handleTime: '', refId: bag.id,
            details: `判图员：${operatorName}，已自动生成查扣登记 ${ho.id}`
        });
    }
    store.events.unshift({
        id: `EVT-${fmtDate(now).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
        time: fmtDateTime(now), _ts: now, device: bag.machineName,
        type: result === '违禁' ? '违禁品检测' : (result === '可疑' ? '包裹异常' : '集中判图'),
        status: result === '违禁' ? 'status-danger' : (result === '可疑' ? 'status-warning' : 'status-normal'),
        statusName: '',
        processStatus: result === '正常' ? '已处理' : '处理中',
        passengerId: bag.owner,
        details: `${bag.ownerName} 的包裹 ${bag.id} 人工判图结果：${result}（处置：${bag.disposition}）`
    });
    return bag;
}

export function completeHandoff(handoffId, police) {
    const store = getStore();
    const ho = store.handoffs.find(h => h.id === handoffId);
    if (!ho) return null;
    ho.status = '已完成';
    ho.police = police || '民警·郑志强 (JWT356)';
    ho.finishTs = Date.now();
    ho.finishTime = fmtDateTime(ho.finishTs);
    const evt = store.events.find(e => e.details && e.details.includes(ho.bagId));
    if (evt) { evt.processStatus = '已处理'; }
    const alm = store.alarms.find(a => a.refId === ho.bagId);
    if (alm && alm.status === '未处理') {
        alm.status = '已处理';
        alm.operator = `值班队长·${store.employees.find(e => e.role === '值班队长').name}`;
        alm.handleTime = ho.finishTime;
    }
    return ho;
}

export function handleAlarmById(alarmId, operator, note) {
    const store = getStore();
    const alm = store.alarms.find(a => a.id === alarmId);
    if (!alm || alm.status === '已处理') return null;
    alm.status = '已处理';
    alm.operator = `值班队长·${operator}`;
    alm.handleTime = fmtDateTime(Date.now());
    alm.handleNote = note || '';
    return alm;
}

export function processEventById(eventId, operator) {
    const store = getStore();
    const evt = store.events.find(e => e.id === eventId);
    if (!evt || evt.processStatus === '已处理') return null;
    evt.processStatus = '已处理';
    evt.handler = operator;
    evt.handleTime = fmtDateTime(Date.now());
    return evt;
}

export function toggleChannel(channelId) {
    const store = getStore();
    const ch = store.channels.find(c => c.id === channelId);
    if (!ch) return null;
    ch.status = ch.status === 'open' ? 'closed' : 'open';
    store.events.unshift({
        id: `EVT-${fmtDate(Date.now()).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
        time: fmtDateTime(Date.now()), _ts: Date.now(), device: ch.name,
        type: ch.status === 'open' ? '设备在线' : '设备离线',
        status: ch.status === 'open' ? 'status-normal' : 'status-danger',
        statusName: '', processStatus: '已处理',
        details: `${ch.name} 通道被手动${ch.status === 'open' ? '开启' : '关闭'}（操作人：${store.currentUser.name}）`
    });
    return ch;
}

export function bindPassengerPackage(passengerInput, packageInput, channelId) {
    const store = getStore();
    const p = store.passengers.find(x => x.id === passengerInput || x.name === passengerInput || x.idCard === passengerInput);
    const b = store.bags.find(x => x.id === packageInput);
    if (!p) return { ok: false, msg: `未找到旅客「${passengerInput}」，可在人脸识别页查看人员库` };
    if (!b) return { ok: false, msg: `未找到包裹「${packageInput}」，可在首页最新事件中复制包裹ID` };
    if (b.bindingStatus === '已绑定' && b.owner === p.id) return { ok: false, msg: `包裹 ${b.id} 已与 ${p.name} 绑定` };
    b.owner = p.id; b.ownerName = p.name; b.bindingStatus = '已绑定';
    if (channelId) { b.channel = channelId; b.channelName = store.channels.find(c => c.id === channelId).name; }
    return { ok: true, bag: b, passenger: p };
}

export function unbindPackage(packageId) {
    const store = getStore();
    const b = store.bags.find(x => x.id === packageId);
    if (!b) return null;
    b.bindingStatus = '未绑定';
    return b;
}

export function addToBlacklist(personIdOrName, reason) {
    const store = getStore();
    const p = store.passengers.find(x => x.id === personIdOrName || x.name === personIdOrName);
    if (!p) return { ok: false, msg: '人员不存在' };
    if (store.blacklist.some(x => x.personId === p.id)) return { ok: false, msg: `${p.name} 已在黑名单中` };
    const item = {
        id: `BLK-${Date.now()}`,
        personId: p.id, personName: p.name, idCard: p.idCard,
        joinTime: fmtDateTime(Date.now()), ts: Date.now(),
        reason: reason || '其他原因', by: store.currentUser.name
    };
    store.blacklist.unshift(item);
    return { ok: true, item };
}

// 模拟现场持续产出：每 15 秒新过检 1~2 件 AI 标记包裹，进入判图队列
function simulateArrival(store) {
    const machines = store.devices.filter(d => d.key === 'securityCheckMachine' && d.status === 'online');
    const machine = machines[Math.floor(Math.random() * machines.length)];
    const ct = CONTRABAND_TYPES[Math.floor(Math.random() * CONTRABAND_TYPES.length)];
    const now = Date.now();
    const passenger = store.passengers[Math.floor(Math.random() * store.passengers.length)];
    const kind = Math.random() > 0.5 ? '可疑' : '违禁';
    const bag = {
        id: `PKG-${fmtDate(now).replace(/-/g, '')}-${String(20000 + seq.bag++)}`,
        owner: passenger.id, ownerName: passenger.name,
        channel: machine.channel, channelName: machine.location,
        machine: machine.id, machineName: machine.displayName,
        scanTs: now, scanTime: fmtDateTime(now),
        weightKg: +(0.5 + Math.random() * 12).toFixed(1),
        imageSeed: Math.floor(Math.random() * 100000),
        bindingStatus: '已绑定',
        status: 'pending',
        ai: { label: kind === '违禁' ? ct.name : '疑似' + ct.name, type: ct.name, level: ct.level, confidence: (kind === '违禁' ? 90 + Math.random() * 9 : 76 + Math.random() * 14).toFixed(1) }
    };
    store.bags.unshift(bag);
    store.events.unshift({
        id: `EVT-${fmtDate(now).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
        time: bag.scanTime, _ts: now, device: machine.displayName,
        type: '集中判图', status: 'status-processing', statusName: '',
        processStatus: '未处理', passengerId: bag.owner,
        details: `AI 标记「${bag.ai.label}」(${bag.ai.confidence}%)，等待人工判图`
    });
    return bag;
}

// ---------- Store 单例 ----------
export function getStore() {
    if (window.__SECURITY_STORE__) {
        // 每次访问时按当前时间推进队列（模拟现场持续过检）
        touchLive(store => {
            const pending = store.bags.filter(b => b.status === 'pending');
            if (pending.length < 3 && Math.random() > 0.4) simulateArrival(store);
        });
        return window.__SECURITY_STORE__;
    }

    const todayStart = new Date(); todayStart.setHours(8, 0, 0, 0);
    if (Date.now() < todayStart.getTime()) todayStart.setDate(todayStart.getDate() - 1);

    const employees = makeEmployees();
    const devices = makeDevices();
    const passengers = makePassengers(todayStart.getTime());
    const bags = makeBags(passengers, devices, employees, todayStart.getTime());
    const handoffs = makeHandoffs(bags, employees);
    const events = makeEvents(bags, passengers, devices, todayStart.getTime());
    const alarms = makeAlarms(bags, devices, employees);
    const face = makeFaceData(passengers, devices);
    const channels = makeChannels(devices);

    const store = {
        initAt: Date.now(),
        employees,
        currentUser: employees.find(e => e.role === '判图员'),
        devices,
        passengers: passengers.map(p => ({ ...p, channel: `CH-${1 + Math.floor(Math.random() * 5)}` })),
        bags, handoffs, events, alarms,
        enrollHistory: face.enrollHistory,
        recognitionRecords: face.recognitionRecords,
        blacklist: [],
        channels,
        configs: makeConfigs(),
        auditLogs: [
            { time: fmtDateTime(Date.now() - 2 * 86400000), user: '系统管理员', action: '更新违禁品数据库至 v3.5.2', target: 'CFG-004' },
            { time: fmtDateTime(Date.now() - 4 * 86400000), user: '值班队长·王振宇', action: '调整人脸比对通过阈值 88→90', target: 'CFG-003' }
        ]
    };

    // 初始黑名单（与人员库打通）
    ['携带违禁品', '冲闯安检通道', '冒用他人证件'].forEach((reason, i) => {
        const p = store.passengers[40 + i * 17];
        store.blacklist.unshift({
            id: `BLK-${fmtDate(Date.now()).replace(/-/g, '')}-${String(100 + i)}`,
            personId: p.id, personName: p.name, idCard: p.idCard,
            joinTime: fmtDateTime(Date.now() - (3 + i * 9) * 86400000), ts: Date.now() - (3 + i * 9) * 86400000,
            reason, by: '值班队长·李慧芝'
        });
    });

    window.__SECURITY_STORE__ = store;
    window.__SECURITY_TOUCH__ = 0;
    return store;
}

// 周期性推进实时数据（限频，避免每次 getStore 都生成）
function touchLive(update) {
    const store = window.__SECURITY_STORE__;
    const now = Date.now();
    if (window.__SECURITY_TOUCH__ && now - window.__SECURITY_TOUCH__ < 15000) return;
    window.__SECURITY_TOUCH__ = now;
    update(store);
}
