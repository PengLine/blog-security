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
let seq = { evt: 0, bag: 0, emp: 0, alm: 0, ho: 0, rec: 0, enr: 0, wo: 0, dt: 0, sub: 0 };

// 班次定义：两班倒（白班在岗 / 夜班值守），夜班时段跨天
export const SHIFT_DEFS = [
    { key: '早班', team: '甲班', range: '08:00 - 20:00', startH: 8, endH: 20 },
    { key: '晚班', team: '乙班', range: '20:00 - 次日08:00', startH: 20, endH: 32 }
];

// ---------- 静态字典 ----------
export const CONTRABAND_TYPES = [
    { name: '刀具', level: 'severe', color: '#f56c6c', items: ['水果刀', '匕首', '裁纸刀', '修眉刀'] },
    { name: '液体', level: 'restricted', color: '#409eff', items: ['发胶', '指甲油', '白酒(超量)', '汽油样品'] },
    { name: '易燃易爆', level: 'severe', color: '#e6a23c', items: ['打火机(超量)', '烟花爆竹', '酒精(超量)', '压缩气罐'] },
    { name: '电池/充电宝', level: 'restricted', color: '#722ed1', items: ['超规充电宝', '锂电池(散装)', '焊锡电池'] },
    { name: '钝器/工具', level: 'restricted', color: '#909399', items: ['锤子', '棍棒', '扳手'] }
];

export const ROLES = ['判图员', '值机安检员', '复检员', '值班队长', '维修工程师'];

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
        { name: '李慧芝', role: '值班队长', team: '乙班' },
        { name: '韩烁', role: '维修工程师', team: '甲班' },
        { name: '秦朗', role: '维修工程师', team: '乙班' }
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
        // 可疑 → 复检开包流程：新近记录进待复检队列，较早记录已完成复检
        const fresh = judgeTs > now - 20 * 60000;
        if (fresh) {
            bag.disposition = '转复检';
            bag.recheck = {
                status: Math.random() > 0.6 ? '待复检' : '检查中',
                startTs: 0, finishTs: 0, result: '', note: '', by: ''
            };
            if (bag.recheck.status === '检查中') bag.recheck.startTs = Math.min(now - 60000, judgeTs + 8 * 60000);
        } else if (Math.random() > 0.55) {
            bag.disposition = '复检放行';
            bag.recheck = {
                status: '已完成', startTs: judgeTs + 6 * 60000, finishTs: judgeTs + 18 * 60000,
                result: '放行', note: '开包检查未见异常，复测后放行', by: '复检员·何秀兰'
            };
        } else {
            bag.disposition = '开包查扣';
            const ct2 = CONTRABAND_TYPES.find(c => c.name === bag.ai.type) || CONTRABAND_TYPES[0];
            bag.seized = {
                typeName: ct2.name, level: ct2.level,
                itemName: ct2.items[Math.floor(Math.random() * ct2.items.length)],
                qty: 1, unit: '件'
            };
            bag.recheck = {
                status: '已完成', startTs: judgeTs + 5 * 60000, finishTs: judgeTs + 20 * 60000,
                result: '查扣', note: '开包检查确认违禁，转开包查扣', by: '复检员·徐宗翰'
            };
        }
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

    // 质控抽检：约 12% 已判包裹有复检结论（绩效考核的数据来源）
    if (Math.random() < 0.12) {
        const miss = result !== '违禁' && bag.ai && bag.ai.label === bag.ai.type && Math.random() < 0.3;
        bag.qc = {
            result: miss ? '漏判' : (Math.random() < 0.08 ? '处置不规范' : '合格'),
            checkedBy: '质控员·孙瑞',
            checkTime: fmtDateTime(Math.min(now - 10 * 60000, judgeTs + 30 * 60000))
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
            disposition: handled ? 'pass' : '',
            dispositionName: handled ? '通过放行' : '',
            handleResult: handled ? '已按违禁流程查扣并完成民警交接' : '',
            refId: bag.id,
            details: `判图依据：X光双视角图像，AI 置信度 ${bag.ai.confidence}%；处置：开包查扣`
        });
    });

    // 可疑品检出告警（关联包裹未查扣，可继续走复检 / 开包 / 通过分支）
    bags.filter(b => b.judgeResult === '可疑').slice(0, 12).forEach(bag => {
        const done = bag.recheck && bag.recheck.status === '已完成';
        list.push({
            id: `ALM-${fmtDate(bag.judgeTs).replace(/-/g, '')}-${String(3000 + seq.alm++)}`,
            ts: bag.judgeTs, time: fmtDateTime(bag.judgeTs),
            device: bag.machineName, level: 'warning', type: '可疑品检出',
            content: `${bag.ownerName} 的包裹 ${bag.id} 判图可疑（疑似${bag.ai ? bag.ai.type : '违禁品'}），待复检确认`,
            status: done ? '已处理' : '未处理',
            operator: done ? '值班队长·李慧芝' : '',
            handleTime: done ? fmtDateTime(bag.recheck.finishTs) : '',
            disposition: done ? 'pass' : '',
            dispositionName: done ? '通过放行' : '',
            handleResult: done ? `复检结论：${bag.recheck.result}（${bag.recheck.note}）` : '',
            refId: bag.id,
            details: `AI 置信度 ${bag.ai ? bag.ai.confidence : '-'}%，判图员 ${bag.judgeOperator || '-'}`
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
        { level: 'warning', type: '网络延迟', device: '核心交换机', content: '安检专网平均延迟 68ms，波动增大', status: '已处理', disposition: 'pass' },
        { level: 'info', type: '系统更新', device: '系统平台', content: '判图辅助算法升级至 v3.5.2，新增锂电池细分识别', status: '已处理', disposition: 'pass' },
        { level: 'info', type: '设备维护', device: '1号通道安检机', content: '按月完成传送带保养与铅门检查', status: '已忽略', disposition: 'ignore', note: '例行保养通知，无需处置' },
        { level: 'info', type: '数据备份', device: '系统平台', content: '每日增量备份完成', status: '已处理', disposition: 'pass' }
    ];
    sysAlarms.forEach(s => {
        const ts = now - Math.random() * 10 * 3600000;
        const done = s.status !== '未处理';
        const disp = ALARM_DISPOSITIONS.find(d => d.key === s.disposition);
        list.push({
            id: `ALM-${fmtDate(ts).replace(/-/g, '')}-${String(3000 + seq.alm++)}`,
            ts, time: fmtDateTime(ts), device: s.device, level: s.level, type: s.type, content: s.content,
            status: s.status,
            operator: done ? `值班队长·${['王振宇', '李慧芝'][Math.floor(Math.random() * 2)]}` : '',
            handleTime: done ? fmtDateTime(ts + 60000 * (10 + Math.random() * 60)) : '',
            disposition: s.disposition || '',
            dispositionName: disp ? disp.label : '',
            handleNote: s.note || '',
            handleResult: done ? (s.note || '核实无异常，直接归档') : '',
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
    bag.reviewDelayMin = Math.max(1, Math.round((now - bag.scanTs) / 60000));

    if (result === '正常') {
        bag.disposition = '放行';
    } else if (result === '可疑') {
        bag.disposition = '转复检';
        bag.recheck = { status: '待复检', startTs: 0, finishTs: 0, result: '', note: '', by: '' };
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
    if (!alm || alm.status !== '未处理') return null;
    alm.status = '已处理';
    alm.disposition = 'pass';
    alm.dispositionName = '通过放行';
    alm.handleResult = '现场处置完毕，直接归档';
    alm.operator = `值班队长·${operator}`;
    alm.handleTime = fmtDateTime(Date.now());
    alm.handleNote = note || '';
    return alm;
}

// ---------- 告警处置字典与处置动作 ----------
// 一条告警可按处置结论走“通过 / 忽略 / 转复检 / 转开包 / 转维保”多分支
export const ALARM_DISPOSITIONS = [
    { key: 'pass', label: '通过放行', desc: '核实无风险，直接放行归档', status: '已处理' },
    { key: 'ignore', label: '忽略（误报）', desc: '判定为误报，计入误报统计', status: '已忽略' },
    { key: 'recheck', label: '转复检', desc: '通知复检台开包复检', status: '已处理', needBag: true },
    { key: 'openbag', label: '转开包检查', desc: '直接进入开包检查（检查中）', status: '已处理', needBag: true },
    { key: 'repair', label: '转维保工单', desc: '设备故障自动生成维修工单', status: '已处理', needDevice: true }
];

export function disposeAlarm(alarmId, dispositionKey, operator, note) {
    const store = getStore();
    const alm = store.alarms.find(a => a.id === alarmId);
    if (!alm) return { ok: false, msg: '告警不存在' };
    if (alm.status !== '未处理') return { ok: false, msg: `告警当前状态为「${alm.status}」，无需重复处置` };
    const disp = ALARM_DISPOSITIONS.find(d => d.key === dispositionKey);
    if (!disp) return { ok: false, msg: '未知的处置方式' };

    const now = Date.now();
    const bag = alm.refId ? store.bags.find(b => b.id === alm.refId) : null;
    let extra = disp.desc;
    let order = null;
    let target = null;

    if (disp.key === 'recheck' || disp.key === 'openbag') {
        if (!bag) return { ok: false, msg: '该告警无关联包裹，无法转复检/开包' };
        if (bag.seized) return { ok: false, msg: '该包裹已开包查扣并完成民警交接，无法重复复检' };
        if (!bag.recheck || bag.recheck.status === '已完成') {
            bag.recheck = { status: '待复检', startTs: 0, finishTs: 0, result: '', note: '', by: '' };
        }
        bag.disposition = '转复检';
        if (disp.key === 'openbag') {
            bag.recheck.status = '检查中';
            bag.recheck.startTs = now;
            bag.recheck.by = `复检员·${operator}`;
        }
        extra = disp.key === 'openbag'
            ? `包裹 ${bag.id} 已转入开包检查（检查中）`
            : (bag.recheck.status === '检查中' ? `包裹 ${bag.id} 已在开包检查中` : `包裹 ${bag.id} 已进入待复检队列`);
        store.events.unshift({
            id: `EVT-${fmtDate(now).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
            time: fmtDateTime(now), _ts: now, device: alm.device,
            type: '包裹异常', status: 'status-warning', statusName: '', processStatus: '处理中',
            passengerId: bag.owner,
            details: `告警 ${alm.id} 转${disp.key === 'openbag' ? '开包检查' : '复检'}：${bag.ownerName} 的包裹 ${bag.id}，处置人 ${operator}`
        });
        target = 'recheck';
    } else if (disp.key === 'repair') {
        const dev = store.devices.find(d => d.displayName === alm.device || d.name === alm.device || d.location === alm.device);
        if (!dev) return { ok: false, msg: `未找到与「${alm.device}」匹配的设备，无法转维保` };
        const r = createRepairOrder(dev.id, alm.type === '设备离线' ? '心跳丢失/设备离线' : '告警联动检修',
            alm.level === 'danger' ? '紧急' : '普通', `${alm.content}（来源：告警 ${alm.id}）`);
        if (r.ok) {
            order = r.wo;
            extra = `已生成维修工单 ${r.wo.id}（${r.wo.level}）`;
            target = 'workorder';
        } else {
            extra = `转维保未建单：${r.msg}`;
        }
    } else if (disp.key === 'ignore') {
        extra = '判定为误报，已忽略（计入误报统计）';
    } else {
        extra = '核实无风险，通过放行';
    }

    alm.status = disp.status;
    alm.disposition = disp.key;
    alm.dispositionName = disp.label;
    alm.operator = `值班队长·${operator}`;
    alm.handleTime = fmtDateTime(now);
    alm.handleNote = note || '';
    alm.handleResult = extra;
    store.auditLogs.unshift({ time: fmtDateTime(now), user: `值班队长·${operator}`, action: `处置告警 ${alm.id}：${disp.label}（${extra}）`, target: alm.id });
    return { ok: true, alarm: alm, result: extra, order, target, bag };
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

// ---------- 复检开包（判图可疑 → 复检台开包检查） ----------
// 队列：已判图“可疑”且 recheck 未完成的包裹
export function recheckQueue(store) {
    return store.bags
        .filter(b => b.recheck && b.recheck.status !== '已完成')
        .sort((a, b) => (a.recheck.status === '检查中' ? -1 : 1) - (b.recheck.status === '检查中' ? -1 : 1) || (b.judgeTs || 0) - (a.judgeTs || 0));
}

export function startRecheck(bagId, operator) {
    const store = getStore();
    const bag = store.bags.find(b => b.id === bagId);
    if (!bag || !bag.recheck || bag.recheck.status === '已完成') return null;
    bag.recheck.status = '检查中';
    bag.recheck.startTs = Date.now();
    bag.recheck.by = operator;
    return bag;
}

// 完成开包检查：pass=true → 未见异常复检放行；pass=false → 检出违禁转查扣（生成交接单+告警）
export function completeRecheck(bagId, pass, note, operator) {
    const store = getStore();
    const bag = store.bags.find(b => b.id === bagId);
    if (!bag || !bag.recheck || bag.recheck.status === '已完成') return null;
    const now = Date.now();
    bag.recheck.status = '已完成';
    bag.recheck.finishTs = now;
    bag.recheck.by = operator;
    bag.recheck.result = pass ? '放行' : '查扣';
    bag.recheck.note = note || (pass ? '开包检查未见异常，复检放行' : '开包检查确认违禁，转开包查扣');

    if (pass) {
        bag.disposition = '复检放行';
        store.events.unshift({
            id: `EVT-${fmtDate(now).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
            time: fmtDateTime(now), _ts: now, device: bag.machineName,
            type: '包裹异常', status: 'status-normal', statusName: '', processStatus: '已处理',
            passengerId: bag.owner, handler: operator, handleTime: fmtDateTime(now),
            details: `${bag.ownerName} 的包裹 ${bag.id} 开包检查未见异常，复检放行（复检人：${operator}）`
        });
    } else {
        bag.disposition = '开包查扣';
        const ct = CONTRABAND_TYPES.find(c => c.name === (bag.ai ? bag.ai.type : '')) || CONTRABAND_TYPES[CONTRABAND_TYPES.length - 1];
        if (!bag.seized) {
            bag.seized = { typeName: ct.name, level: ct.level, itemName: ct.items[0], qty: 1, unit: '件' };
        }
        const ho = {
            id: `HO-${fmtDate(now).replace(/-/g, '')}-${String(500 + seq.ho++)}`,
            bagId: bag.id, passengerName: bag.ownerName, passengerId: bag.owner,
            channel: bag.channelName, machineName: bag.machineName,
            typeName: `${bag.seized.typeName}·${bag.seized.itemName}`, category: bag.seized.typeName,
            level: bag.seized.level, qty: bag.seized.qty, unit: bag.seized.unit,
            foundWay: '开包检查', foundBy: operator, foundByRole: '复检员',
            ts: now, time: fmtDateTime(now), status: '待移交',
            toPost: '复检台', police: '',
            storageNo: `CC${fmtDate(now).replace(/-/g, '').slice(2)}${String(1000 + Math.floor(Math.random() * 8999))}`,
            note: '复检开包检出违禁品，待民警交接'
        };
        store.handoffs.unshift(ho);
        store.alarms.unshift({
            id: `ALM-${fmtDate(now).replace(/-/g, '')}-${String(3000 + seq.alm++)}`,
            ts: now, time: fmtDateTime(now), device: bag.machineName, level: 'danger', type: '违禁品检出',
            content: `${bag.ownerName} 的包裹 ${bag.id} 开包检查检出违禁：${ho.typeName}`,
            status: '未处理', operator: '', handleTime: '', refId: bag.id,
            details: `复检员：${operator}，已自动生成查扣登记 ${ho.id}`
        });
        store.events.unshift({
            id: `EVT-${fmtDate(now).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
            time: fmtDateTime(now), _ts: now, device: bag.machineName,
            type: '违禁品检测', status: 'status-danger', statusName: '', processStatus: '处理中',
            passengerId: bag.owner,
            details: `${bag.ownerName} 的包裹 ${bag.id} 开包检查检出${ho.typeName}，已生成查扣登记 ${ho.id}`
        });
    }
    return bag;
}

// ---------- 备件库存 ----------
function makeSpareParts() {
    return [
        { name: '以太网模块', stock: 6, min: 4, unit: '块' },
        { name: '温度传感器', stock: 9, min: 5, unit: '个' },
        { name: '电源适配器', stock: 3, min: 4, unit: '个' },
        { name: '传送带皮带', stock: 12, min: 6, unit: '条' },
        { name: '闪烁探测器', stock: 2, min: 2, unit: '个' },
        { name: '门磁模块', stock: 5, min: 3, unit: '个' }
    ];
}

// ---------- 人脸核验记录（1:1 人证比对工作台写入） ----------
export function addRecognitionRecord({ person, device, channel, similarity, status, temperature }) {
    const store = getStore();
    const now = Date.now();
    const rec = {
        id: `REC-${fmtDate(now).replace(/-/g, '')}-${String(4000 + seq.rec++)}`,
        time: fmtDateTime(now), ts: now,
        personId: person.id, personName: person.name,
        device: device || '人证对比工作台', channel: channel || '人工核验台',
        similarity: String(similarity), status, temperature: temperature || person.temperature
    };
    store.recognitionRecords.unshift(rec);
    store.events.unshift({
        id: `EVT-${fmtDate(now).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
        time: fmtDateTime(now), _ts: now, device: rec.device,
        type: status === '未识别' ? '未注册' : '正常通过',
        status: status === '识别成功' ? 'status-normal' : 'status-warning', statusName: '',
        processStatus: status === '人工复核' ? '处理中' : (status === '识别成功' ? '已处理' : '未处理'),
        passengerId: person.id,
        details: `人证比对：${person.name}（${person.id}）相似度 ${similarity}%，结论：${status}`
    });
    return rec;
}

// ---------- 数据中台：多协议采集 → 链路处理 → 分级存储 → 订阅分发 ----------
export const PROTOCOLS = ['MQTT', 'Modbus TCP', 'OPC UA', 'HTTP/HTTPS', 'RTSP', 'GB/T 28181', 'WebSocket', 'SNMP'];

// 设备类型 → 采集协议/主题/端口/单日基准数据量
const COLLECT_PROFILE = {
    securityCheckMachine: { protocol: 'OPC UA', topic: 'xray/image.meta', freq: 1, port: 4840, rows: 2600 },
    recheckTable: { protocol: 'MQTT', topic: 'recheck/result', freq: 5, port: 1883, rows: 320 },
    metalDoor: { protocol: 'Modbus TCP', topic: 'door/alarm.raw', freq: 2, port: 502, rows: 980 },
    millimeterWaveDoor: { protocol: 'OPC UA', topic: 'mmw/scan', freq: 1, port: 4840, rows: 1250 },
    antiTheftDoor: { protocol: 'Modbus TCP', topic: 'door/antiTheft.raw', freq: 2, port: 502, rows: 760 },
    classificationDoor: { protocol: 'Modbus TCP', topic: 'door/classify.raw', freq: 2, port: 502, rows: 700 },
    accessControl: { protocol: 'HTTP/HTTPS', topic: 'access/gate.event', freq: 3, port: 8080, rows: 640 },
    accessVideo: { protocol: 'RTSP', topic: 'video/frame.meta', freq: 1, port: 554, rows: 3200 },
    personCertCompare: { protocol: 'WebSocket', topic: 'face/verify.result', freq: 1, port: 9000, rows: 1450 },
    explosiveDetector: { protocol: 'SNMP', topic: 'detector/explosive.status', freq: 10, port: 161, rows: 260 },
    liquidDetector: { protocol: 'SNMP', topic: 'detector/liquid.status', freq: 10, port: 161, rows: 240 }
};

function makeDataSources(devices, now) {
    return devices.map((d, i) => {
        const p = COLLECT_PROFILE[d.key] || { protocol: 'MQTT', topic: 'misc/telemetry', freq: 5, port: 1883, rows: 200 };
        const offline = d.status === 'offline';
        const unstable = d.status === 'warning';
        return {
            id: `DS-${String(2001 + i)}`,
            deviceId: d.id, deviceName: d.name, displayName: d.displayName,
            category: d.category, channel: d.channel,
            protocol: p.protocol, endpoint: `${d.ip}:${p.port}`,
            topic: `security/${d.channel.toLowerCase()}/${p.topic}`,
            freq: p.freq,
            status: offline ? '离线' : unstable ? '重连中' : '在线',
            latencyMs: offline ? 0 : (unstable ? 120 + Math.round(Math.random() * 260) : 6 + Math.round(Math.random() * 42)),
            errorRate: offline ? 100 : (unstable ? 2 + Math.random() * 4 : Math.random() * 0.6),
            todayRows: Math.round(p.rows * (0.6 + Math.random() * 0.8) * (offline ? 0.3 : 1)),
            lastHeartbeat: offline ? now - (2 + (i % 3)) * 3600000 : now - Math.round(3000 + Math.random() * 90000)
        };
    });
}

function makePipelines() {
    const build = (id, name, source, protocol, topic, rows, base) => {
        const qps = Math.max(1, Math.round(rows / 7200));
        const stages = [
            { name: '采集接入', latencyMs: base, qps, errors: 0 },
            { name: '解析校验', latencyMs: base + 6, qps, errors: 2 },
            { name: '清洗标准化', latencyMs: base + 9, qps, errors: 0 },
            { name: '分级入库', latencyMs: base + 14, qps, errors: 1 },
            { name: '订阅分发', latencyMs: base + 4, qps: qps * 2, errors: 0 }
        ];
        return {
            id, name, source, protocol, topic, mode: '实时',
            todayRows: rows, backlog: 0, status: '运行中',
            latencyMs: stages.reduce((s, x) => s + x.latencyMs, 0),
            stages
        };
    };
    return [
        build('PIPE-01', 'X光图像元数据流', '安检机 ×6', 'OPC UA → Kafka', 'xray/image.meta', 182430, 8),
        build('PIPE-02', '安检门告警流', '金属门/毫米波门/防损门 ×18', 'Modbus TCP → MQTT', 'door/alarm.raw', 64210, 5),
        build('PIPE-03', '人证核验结果流', '人证对比终端 ×6', 'WebSocket → Kafka', 'face/verify.result', 18320, 12),
        build('PIPE-04', '设备遥测心跳流', '全量设备 ×66', 'SNMP / Modbus → Kafka', 'device/telemetry', 96300, 3),
        build('PIPE-05', '判图结果回流', '集中判图工作台', 'HTTP → Kafka', 'judge/result', 26400, 18)
    ];
}

function makeStorages() {
    return [
        { id: 'STG-01', layer: '实时缓存', engine: 'Redis Cluster', data: '判图队列 / 告警队列 / 会话', capacity: '32 GB', usedPct: 46, retention: '24 小时', writeRate: '2.8k msg/s', status: '健康' },
        { id: 'STG-02', layer: '时序库', engine: 'InfluxDB', data: '设备遥测 / 心跳 / 温度', capacity: '2 TB', usedPct: 38, retention: '90 天', writeRate: '1.6k point/s', status: '健康' },
        { id: 'STG-03', layer: '关系库', engine: 'PostgreSQL', data: '旅客 / 包裹 / 交接台账', capacity: '1 TB', usedPct: 52, retention: '长期', writeRate: '120 tps', status: '健康' },
        { id: 'STG-04', layer: '对象存储', engine: 'MinIO', data: 'X光原图 / 开包影像 / 抓拍', capacity: '20 TB', usedPct: 61, retention: '180 天', writeRate: '35 MB/s', status: '健康' },
        { id: 'STG-05', layer: '消息总线', engine: 'Kafka', data: '采集主题 / 分发主题', capacity: '—', usedPct: 24, retention: '7 天', writeRate: '4.2k msg/s', status: '健康' }
    ];
}

function makeSubscriptions() {
    const now = Date.now();
    return [
        { id: 'SUB-2026-101', subscriber: '集中判图工作台', topic: 'xray/image.ready', protocol: 'WebSocket 推送', desc: '新过检图像实时推送至判图队列', status: '启用', qps: 42, todayCount: 182430, lastPush: fmtDateTime(now - 12000) },
        { id: 'SUB-2026-102', subscriber: '告警中心', topic: 'alarm/created', protocol: 'MQTT 订阅', desc: '设备告警 / 违禁检出即时告警', status: '启用', qps: 6, todayCount: 4180, lastPush: fmtDateTime(now - 42000) },
        { id: 'SUB-2026-103', subscriber: '事件中心', topic: 'event/log', protocol: 'Kafka 消费组', desc: '全量事件日志归集与检索', status: '启用', qps: 18, todayCount: 26400, lastPush: fmtDateTime(now - 8000) },
        { id: 'SUB-2026-104', subscriber: '统计分析', topic: 'agg/metrics.5m', protocol: 'Kafka 消费组', desc: '5 分钟聚合指标（客流/判图/查获）', status: '启用', qps: 2, todayCount: 5760, lastPush: fmtDateTime(now - 32000) },
        { id: 'SUB-2026-105', subscriber: '维保工单', topic: 'device/telemetry', protocol: 'HTTP 回调', desc: '设备异常遥测触发报修建议', status: '启用', qps: 4, todayCount: 9630, lastPush: fmtDateTime(now - 26000) },
        { id: 'SUB-2026-106', subscriber: '运营大屏', topic: 'dashboard/realtime', protocol: 'WebSocket 推送', desc: '大屏实时指标与告警滚动', status: '停用', qps: 0, todayCount: 0, lastPush: '—' }
    ];
}

// 新建数据订阅（防止重复订阅同一主题）
export function addSubscription({ subscriber, topic, protocol, desc }) {
    const store = getStore();
    if (!subscriber || !topic) return { ok: false, msg: '请填写订阅方与订阅主题' };
    if (store.subscriptions.some(s => s.subscriber === subscriber && s.topic === topic)) {
        return { ok: false, msg: '该订阅方已订阅此主题，请勿重复创建订阅' };
    }
    const now = Date.now();
    const item = {
        id: `SUB-${fmtDate(now).replace(/-/g, '')}-${String(200 + seq.sub++)}`,
        subscriber, topic, protocol: protocol || 'MQTT 订阅',
        desc: desc || '由数据中台新增的订阅', status: '启用',
        qps: 0, todayCount: 0, lastPush: '—'
    };
    store.subscriptions.unshift(item);
    store.auditLogs.unshift({ time: fmtDateTime(now), user: '系统管理员', action: `新增数据订阅：${subscriber} → ${topic}`, target: item.id });
    return { ok: true, item };
}

// 启用 / 停用订阅
export function toggleSubscription(id) {
    const store = getStore();
    const item = store.subscriptions.find(s => s.id === id);
    if (!item) return null;
    item.status = item.status === '启用' ? '停用' : '启用';
    if (item.status === '停用') { item.qps = 0; }
    store.auditLogs.unshift({ time: fmtDateTime(Date.now()), user: '系统管理员', action: `${item.status}数据订阅：${item.subscriber} → ${item.topic}`, target: item.id });
    return item;
}

// 模拟一轮设备上报，驱动接入量 / 分发计数增长
export function simulateIngest() {
    const store = getStore();
    const online = store.dataSources.filter(s => s.status === '在线');
    let rows = 0;
    online.forEach(s => {
        const add = Math.max(1, Math.round(s.todayRows * (0.0005 + Math.random() * 0.0015)));
        s.todayRows += add;
        s.lastHeartbeat = Date.now();
        rows += add;
    });
    store.pipelines.forEach(p => { p.todayRows += Math.round(rows / store.pipelines.length); });
    store.subscriptions.filter(s => s.status === '启用').forEach(s => {
        s.todayCount += Math.round(rows / 4);
        s.lastPush = fmtDateTime(Date.now());
    });
    store.auditLogs.unshift({ time: fmtDateTime(Date.now()), user: '数据中台·调度器', action: `模拟一轮设备上报，新增采集 ${rows} 条`, target: 'DC-INGEST' });
    return rows;
}

// ==================== 数据中台：架构分层 ====================
// L1 数据源 → L2 接入 → L3 计算处理 → L4 分层存储 → L5 数据服务 → L6 应用消费
export const DC_LAYERS = [
    {
        key: 'source', name: '数据源层', sub: '设备 / 系统 / 视频',
        items: ['安检机图像元数据', '安检门告警流', '毫米波 / 防损门遥测', '人证比对记录', '视频抓拍索引', '业务系统台账'],
        standard: '统一设备编码 · 通道维度 · 时间戳对齐',
        note: '66 台设备 · 8 类协议 · 6 个通道'
    },
    {
        key: 'access', name: '接入层', sub: '协议适配 · 边缘汇聚',
        items: ['OPC UA / Modbus 适配器', 'MQTT 网关', 'RTSP / GB28181 视频接入', 'HTTP / WebSocket 回调', '边缘缓存断点续传'],
        standard: 'Kafka 采集主题 · 3 副本 · 7 天回放',
        note: '66 个接入端点 · 时延 < 50ms'
    },
    {
        key: 'compute', name: '计算处理层', sub: '流批一体 · 规则引擎',
        items: ['解析与格式校验', '清洗去重标准化', '设备-通道关联补全', '质量规则校验 / 死信队列', '5 分钟指标聚合'],
        standard: 'Exactly-Once · Checkpoint 60s',
        note: 'Flink 5 作业 · 峰值 4.2k msg/s'
    },
    {
        key: 'storage', name: '存储层', sub: '湖仓分层 + 多模存储',
        items: ['ODS 原始层', 'DWD 明细层', 'DWS 汇总层', 'ADS 应用层', 'Redis / InfluxDB / PostgreSQL / MinIO'],
        standard: '按天分区 · 生命周期分层 · 冷热分离',
        note: '热 24h · 温 90 天 · 冷 180 天'
    },
    {
        key: 'service', name: '服务层', sub: '统一数据服务与共享交换',
        items: ['数据 API 网关', 'MQTT / Kafka 主题订阅', '数据目录与元数据', '血缘与质量看板', '权限与脱敏'],
        standard: '限流 2000 QPS · SLA 99.9%',
        note: '7 个数据服务 · 6 个业务订阅'
    },
    {
        key: 'consumer', name: '应用消费层', sub: '平台各业务模块',
        items: ['集中判图', '复检开包', '告警中心', '运营分析', '维保工单', '运营大屏'],
        standard: '按需订阅 · 消费位点可回溯',
        note: '订阅分发至 6 个平台应用'
    }
];

// 主题域：数仓建模的业务边界
export const DC_DOMAINS = [
    { key: 'passenger', name: '旅客域', entities: '旅客档案 / 证件 / 人脸特征', tables: ['dwd_face_verify', 'dws_face_pass_flow'], owner: '通行核验组' },
    { key: 'bag', name: '包裹域', entities: '包裹 / 人包绑定 / 过检流水 / 交接', tables: ['dwd_bag_scan_detail', 'dwd_handoff_detail', 'dws_channel_hourly'], owner: '安检作业组' },
    { key: 'image', name: '图像域', entities: 'X光原图 / 开包影像 / 抓拍', tables: ['ods_xray_image_meta', 'ods_video_capture'], owner: '数据平台组' },
    { key: 'device', name: '设备域', entities: '设备台账 / 遥测 / 维保', tables: ['ods_device_telemetry', 'dwd_workorder_detail', 'dws_device_health_daily'], owner: '设备运维组' },
    { key: 'alarm', name: '告警事件域', entities: '告警 / 事件 / 处置结论', tables: ['ods_alarm_raw', 'dwd_judge_record', 'ads_alarm_cockpit'], owner: '监控中心' },
    { key: 'ops', name: '运营域', entities: '客流 / 绩效 / 服务质量', tables: ['dws_judge_quality', 'ads_ops_dashboard', 'ads_performance_rank'], owner: '运营管理组' }
];

export const DC_TECH_STACK = [
    { component: 'Kafka', role: '消息总线 / 削峰回放', spec: '3 broker · 8 topic · 3 副本', ha: '跨机架副本 + 7 天保留' },
    { component: 'Flink', role: '实时流处理', spec: '5 作业 · 4C8G · Checkpoint 60s', ha: '双 TaskManager 热备' },
    { component: 'Redis Cluster', role: '热数据缓存 / 队列', spec: '3 主 3 从 · 32 GB', ha: '主从自动切换' },
    { component: 'InfluxDB', role: '设备时序指标', spec: '3 节点 · 90 天保留', ha: '副本因子 2' },
    { component: 'PostgreSQL', role: '业务关系库', spec: '1 主 1 备 + 1 只读', ha: '流复制 · RPO≈0' },
    { component: 'MinIO', role: '图像对象存储', spec: '4 节点 · EC 4+2 · 60 TB', ha: '纠删码冗余' },
    { component: 'API 网关', role: '统一数据服务', spec: '2 实例 · 限流 2000 QPS', ha: '双活 + 健康探测' }
];

export const DC_CAPACITY = [
    { name: '存储总量', value: '68.4 / 120 TB', pct: 57 },
    { name: '集群 CPU', value: '41%', pct: 41 },
    { name: '消息积压', value: '12.4k 条', pct: 12 },
    { name: '日均增量', value: '+0.46 TB / 天', pct: 38 }
];

export const DC_SECURITY_LEVELS = [
    { level: 'L1 公开', scope: '运营统计指标 / 通道客流', policy: '可展示与导出，附带水印追踪' },
    { level: 'L2 内部', scope: '设备遥测 / 维保工单 / 巡检记录', policy: '登录可见，按岗位授权' },
    { level: 'L3 敏感', scope: '旅客姓名 / 证件号 / 联系方式', policy: '字段脱敏（证件保留前 4 后 2）' },
    { level: 'L4 机密', scope: '人脸特征 / X光原图 / 开包影像', policy: '加密存储 + 双人授权 + 全量审计' }
];

// 数仓分层表模型（ODS → DWD → DWS → ADS）
function makeWarehouseTables() {
    return [
        { id: 'T-ODS-01', layer: 'ODS', table: 'ods_xray_image_meta', cn: 'X光图像元数据', domain: '图像域', rows: 4862000, growth: '+182k/日', update: '实时(1s)', partition: 'dt / channel', owner: '数据平台组', up: ['安检机 OPC UA 图像流'], down: ['dwd_bag_scan_detail'] },
        { id: 'T-ODS-02', layer: 'ODS', table: 'ods_device_telemetry', cn: '设备遥测原始流', domain: '设备域', rows: 12480000, growth: '+310k/日', update: '实时(5s)', partition: 'dt / device_type', owner: '数据平台组', up: ['MQTT device/telemetry'], down: ['dwd_workorder_detail', 'dws_device_health_daily'] },
        { id: 'T-ODS-03', layer: 'ODS', table: 'ods_alarm_raw', cn: '告警原始流水', domain: '告警事件域', rows: 86400, growth: '+4.1k/日', update: '实时(1s)', partition: 'dt / level', owner: '监控中心', up: ['安检门 / 毫米波门 MQTT'], down: ['ads_alarm_cockpit'] },
        { id: 'T-ODS-04', layer: 'ODS', table: 'ods_video_capture', cn: '视频抓拍索引', domain: '图像域', rows: 320000, growth: '+9.6k/日', update: '实时(30s)', partition: 'dt / camera', owner: '数据平台组', up: ['RTSP / GB28181 抓拍'], down: ['dwd_face_verify'] },
        { id: 'T-DWD-01', layer: 'DWD', table: 'dwd_bag_scan_detail', cn: '包裹过检明细', domain: '包裹域', rows: 1824300, growth: '+182k/日', update: '分钟级', partition: 'dt / channel', owner: '安检作业组', up: ['ods_xray_image_meta', 'ods_device_telemetry'], down: ['dws_channel_hourly', 'ads_ops_dashboard'] },
        { id: 'T-DWD-02', layer: 'DWD', table: 'dwd_judge_record', cn: '判图记录明细', domain: '告警事件域', rows: 264000, growth: '+26k/日', update: '分钟级', partition: 'dt / judge_type', owner: '监控中心', up: ['ods_xray_image_meta'], down: ['dws_judge_quality', 'ads_alarm_cockpit'] },
        { id: 'T-DWD-03', layer: 'DWD', table: 'dwd_face_verify', cn: '人证核验明细', domain: '旅客域', rows: 96000, growth: '+18k/日', update: '分钟级', partition: 'dt / channel', owner: '通行核验组', up: ['ods_video_capture'], down: ['dws_face_pass_flow', 'ads_ops_dashboard'] },
        { id: 'T-DWD-04', layer: 'DWD', table: 'dwd_handoff_detail', cn: '查扣交接明细', domain: '包裹域', rows: 2840, growth: '+120/日', update: '小时级', partition: 'dt', owner: '安检作业组', up: ['dwd_bag_scan_detail', 'ods_alarm_raw'], down: ['ads_ops_dashboard'] },
        { id: 'T-DWD-05', layer: 'DWD', table: 'dwd_workorder_detail', cn: '维保工单明细', domain: '设备域', rows: 7640, growth: '+40/日', update: '小时级', partition: 'dt / level', owner: '设备运维组', up: ['ods_device_telemetry', 'ods_alarm_raw'], down: ['dws_device_health_daily'] },
        { id: 'T-DWS-01', layer: 'DWS', table: 'dws_channel_hourly', cn: '通道小时汇总', domain: '包裹域', rows: 5040, growth: '+144/日', update: '5 分钟', partition: 'dt / channel', owner: '安检作业组', up: ['dwd_bag_scan_detail'], down: ['ads_ops_dashboard'] },
        { id: 'T-DWS-02', layer: 'DWS', table: 'dws_device_health_daily', cn: '设备健康日汇总', domain: '设备域', rows: 462, growth: '+66/日', update: '小时级', partition: 'dt / device_type', owner: '设备运维组', up: ['ods_device_telemetry', 'dwd_workorder_detail'], down: ['ads_ops_dashboard'] },
        { id: 'T-DWS-03', layer: 'DWS', table: 'dws_judge_quality', cn: '判图质量汇总', domain: '运营域', rows: 720, growth: '+24/日', update: '小时级', partition: 'dt / judge', owner: '运营管理组', up: ['dwd_judge_record'], down: ['ads_performance_rank'] },
        { id: 'T-DWS-04', layer: 'DWS', table: 'dws_face_pass_flow', cn: '通行客流汇总', domain: '旅客域', rows: 1440, growth: '+144/日', update: '5 分钟', partition: 'dt / channel', owner: '通行核验组', up: ['dwd_face_verify'], down: ['ads_ops_dashboard'] },
        { id: 'T-ADS-01', layer: 'ADS', table: 'ads_ops_dashboard', cn: '运营大屏指标', domain: '运营域', rows: 2880, growth: '+288/日', update: '5 分钟', partition: 'dt / metric', owner: '运营管理组', up: ['dws_channel_hourly', 'dws_face_pass_flow', 'dws_device_health_daily'], down: ['数据服务：运营指标聚合'] },
        { id: 'T-ADS-02', layer: 'ADS', table: 'ads_alarm_cockpit', cn: '告警驾驶舱指标', domain: '告警事件域', rows: 1440, growth: '+144/日', update: '分钟级', partition: 'dt / level', owner: '监控中心', up: ['ods_alarm_raw', 'dwd_judge_record'], down: ['数据服务：实时告警推送'] },
        { id: 'T-ADS-03', layer: 'ADS', table: 'ads_performance_rank', cn: '绩效排名指标', domain: '运营域', rows: 330, growth: '+30/日', update: '日级', partition: 'dt / team', owner: '运营管理组', up: ['dws_judge_quality'], down: ['数据服务：绩效看板'] }
    ];
}

// 数据服务目录（对外共享交换的统一出口）
function makeDataServices() {
    return [
        { id: 'SVC-01', name: '过检图像元数据服务', path: '/api/v1/xray/images', method: 'GET', domain: '图像域', source: 'ads_ops_dashboard', consumer: '集中判图工作台', qps: 42, p99: '86ms', sla: '99.95%', auth: 'OAuth2 + 设备白名单', status: '在线' },
        { id: 'SVC-02', name: '实时告警推送服务', path: '/ws/v1/alarms', method: 'WS', domain: '告警事件域', source: 'ads_alarm_cockpit', consumer: '告警中心 / 大屏', qps: 6, p99: '32ms', sla: '99.99%', auth: 'Token 鉴权', status: '在线' },
        { id: 'SVC-03', name: '判图结果回写服务', path: '/api/v1/judge/result', method: 'POST', domain: '告警事件域', source: 'dwd_judge_record', consumer: '判图终端', qps: 18, p99: '54ms', sla: '99.9%', auth: '设备证书', status: '在线' },
        { id: 'SVC-04', name: '通行台账查询服务', path: '/api/v1/passage/records', method: 'GET', domain: '旅客域', source: 'dwd_face_verify', consumer: '通行核验 / 客服', qps: 12, p99: '72ms', sla: '99.9%', auth: 'OAuth2 + 行级权限', status: '在线' },
        { id: 'SVC-05', name: '设备遥测订阅服务', path: '/mq/device/telemetry', method: 'MQTT', domain: '设备域', source: 'ods_device_telemetry', consumer: '维保工单 / 设备管理', qps: 4, p99: '18ms', sla: '99.9%', auth: '客户端证书', status: '在线' },
        { id: 'SVC-06', name: '运营指标聚合服务', path: '/api/v1/metrics/agg', method: 'GET', domain: '运营域', source: 'ads_ops_dashboard', consumer: '统计分析 / 大屏', qps: 2, p99: '120ms', sla: '99.5%', auth: 'OAuth2', status: '在线' },
        { id: 'SVC-07', name: '人证核验服务', path: '/api/v1/face/verify', method: 'POST', domain: '旅客域', source: 'dwd_face_verify', consumer: '人证核验工作台', qps: 8, p99: '210ms', sla: '99.9%', auth: 'OAuth2 + 国密签名', status: '在线' }
    ];
}

// 数据质量规则（完整性 / 一致性 / 唯一性 / 有效性 / 及时性）
function makeQualityRules() {
    const now = Date.now();
    return [
        { id: 'QR-01', name: '设备心跳完整性', target: 'ods_device_telemetry', type: '完整性', passRate: 99.82, threshold: 99.5, checkedAt: fmtDateTime(now - 3600000), status: '通过', owner: '平台组' },
        { id: 'QR-02', name: '包裹-旅客绑定一致性', target: 'dwd_bag_scan_detail', type: '一致性', passRate: 98.64, threshold: 98, checkedAt: fmtDateTime(now - 3600000), status: '通过', owner: '安检作业组' },
        { id: 'QR-03', name: '判图结论非空校验', target: 'dwd_judge_record', type: '有效性', passRate: 100, threshold: 99.9, checkedAt: fmtDateTime(now - 3600000), status: '通过', owner: '监控中心' },
        { id: 'QR-04', name: '告警重复上报去重', target: 'ods_alarm_raw', type: '唯一性', passRate: 97.42, threshold: 98, checkedAt: fmtDateTime(now - 3600000), status: '预警', owner: '监控中心' },
        { id: 'QR-05', name: '查扣台账数量合规', target: 'dwd_handoff_detail', type: '准确性', passRate: 99.13, threshold: 99, checkedAt: fmtDateTime(now - 3600000), status: '通过', owner: '安检作业组' },
        { id: 'QR-06', name: '图像元数据入库时延<5s', target: 'ods_xray_image_meta', type: '及时性', passRate: 96.35, threshold: 95, checkedAt: fmtDateTime(now - 3600000), status: '通过', owner: '平台组' }
    ];
}

// 数据质量巡检：重采样通过率，刷新状态并留审计
export function runQualityCheck(operator) {
    const store = getStore();
    const now = Date.now();
    let pass = 0, warn = 0;
    store.qualityRules.forEach(r => {
        const delta = (Math.random() - 0.45) * 0.8;
        r.passRate = Math.min(100, Math.max(90, +(r.passRate + delta).toFixed(2)));
        r.checkedAt = fmtDateTime(now);
        r.status = r.passRate >= r.threshold ? '通过' : '预警';
        r.status === '通过' ? pass++ : warn++;
    });
    store.auditLogs.unshift({ time: fmtDateTime(now), user: operator || '数据中台·质量调度', action: `数据质量巡检完成：${pass} 项通过，${warn} 项预警`, target: 'DC-QUALITY' });
    return { pass, warn, total: store.qualityRules.length };
}

// ==================== 事件处理引擎 ====================
// 链路：设备上报 → 缓存富化 → 双视角绑定 → 人脸绑定 → 判图分流 → 事件落地
export const EVENT_SITE = 'T2 航站楼安检区';

// 告警配置（写入 Redis rule:*，TTL 300s）
export const EVENT_RULES = [
    { key: 'contraband', type: '违禁品事件', source: '安检机', level: 'danger', judgeMode: '集中-高级', bind: '双视角', note: '双视角合并后进入高级集中判图，统计违禁品数量并转违禁事件' },
    { key: 'suspicious', type: '可疑包裹事件', source: '安检机', level: 'warning', judgeMode: '集中-正常', bind: '双视角', note: '集中判图普通席位复核，与包裹、人脸事件关联' },
    { key: 'bagNormal', type: '正常放行事件', source: '安检机', level: 'info', judgeMode: '本地', bind: '双视角', note: '本地判图自动放行，不转告警' },
    { key: 'metalAlarm', type: '金属报警事件', source: '安检门', level: 'warning', judgeMode: '本地', bind: '人脸', note: '金属值超阈值（50），未刷脸/未注册叠加风险标记' },
    { key: 'metalPass', type: '金属通过事件', source: '安检门', level: 'info', judgeMode: '本地', bind: '人脸', note: '金属值在阈值内，记录绝对值/增量/负值' },
    { key: 'flow', type: '客流事件', source: '安检门', level: 'info', judgeMode: '本地', bind: '—', note: '进出方向与人数计数，驱动客流态势' },
    { key: 'classify', type: '分类门违禁品事件', source: '分类门', level: 'danger', judgeMode: '本地', bind: '人脸', note: '检出违禁品并上报数量与位置，兼做客流统计' },
    { key: 'faceTemp', type: '体温异常事件', source: '明眸', level: 'warning', judgeMode: '本地', bind: '—', note: '温度超过 37.3℃ 触发复测与过温人数统计' },
    { key: 'faceRec', type: '人脸识别事件', source: '明眸', level: 'info', judgeMode: '本地', bind: '—', note: '识别成功，写入通行台账' },
    { key: 'unregistered', type: '未注册人员事件', source: '明眸', level: 'warning', judgeMode: '本地', bind: '—', note: '未注册/识别失败，转人工核验' },
    { key: 'explosive', type: '爆炸物检出事件', source: '炸探', level: 'danger', judgeMode: '本地', bind: '—', note: '痕量爆炸物检出，立即启动应急处置' },
    { key: 'combustible', type: '可燃物检出事件', source: '液探', level: 'warning', judgeMode: '本地', bind: '—', note: '液体可燃物检出，转人工复检' },
    { key: 'away', type: '人员离岗事件', source: '姿态', level: 'warning', judgeMode: '本地', bind: '—', note: '离岗时长超过配置阈值（15 分钟）' },
    { key: 'behavior', type: '姿态行为事件', source: '姿态', level: 'info', judgeMode: '本地', bind: '—', note: '瞌睡/聊天/抽烟/打电话/遮挡等行为识别' }
];

function makeEventEngine({ bags, devices, passengers, recognitionRecords }) {
    const now = Date.now();
    const rules = EVENT_RULES.map(r => ({ ...r, cacheKey: `rule:${r.key}`, ttl: 300 }));
    const ruleMap = {};
    rules.forEach(r => { ruleMap[r.key] = r; });

    // 设备信息缓存（dev:*，TTL 600s）：站点、通道、类别、状态
    const deviceCache = devices.map(d => ({
        cacheKey: `dev:${d.id}`, deviceId: d.id, deviceName: d.displayName,
        site: EVENT_SITE, channel: d.channel, channelName: d.location,
        category: d.category, ip: d.ip, status: d.status
    }));
    const cacheOf = id => deviceCache.find(c => c.deviceId === id);
    const byKey = key => devices.filter(d => d.key === key);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const rawEvents = [];
    const viewCache = [];
    const delayQueue = [];
    const faceQueue = [];
    let localSeq = 0;

    const build = (ts, ruleKey, device, payload, opts = {}) => {
        const rule = ruleMap[ruleKey] || rules[0];
        const dc = cacheOf(device.id) || cacheOf(devices[0].id);
        const pending = opts.status === '待处理';
        const e = {
            id: `EV-${fmtDate(ts).replace(/-/g, '')}-${String(50000 + localSeq++)}`,
            ts, time: fmtDateTime(ts),
            source: rule.source, typeKey: rule.key, type: rule.type,
            deviceId: device.id, deviceName: device.displayName,
            site: dc.site, channel: dc.channel, channelName: dc.channelName,
            level: rule.level,
            cache: {
                ruleKey: rule.cacheKey, deviceKey: dc.cacheKey, ruleTtl: rule.ttl, deviceTtl: 600,
                readAt: fmtDateTime(ts + 200), readAt2: pending ? '' : fmtDateTime(Math.min(now, ts + 200))
            },
            payload,
            binding: opts.binding || {
                view: { mode: '—', status: '不适用', views: [], detail: '不涉及包裹双视角', deltaMs: null },
                face: { status: '不适用', attempts: 0, maxAttempts: 20, eventId: '', detail: '' },
                status: '已完成'
            },
            judge: opts.judge || { mode: '待判图', result: '', done: false, operator: '', durationMs: 0, contraband: [] },
            status: opts.status || '已处理',
            outcome: opts.outcome || '',
            processedAt: opts.processedAt || '',
            plan: opts.plan || null
        };
        rawEvents.push(e);
        return e;
    };

    const localJudge = (result, contraband = []) => ({
        mode: '本地', result, done: true, operator: '本地告警中心',
        durationMs: 900 + Math.round(Math.random() * 1500), contraband
    });

    // ---------- 安检机：包裹事件（双视角 + 人脸绑定 + 判图分流） ----------
    const machinePool = byKey('securityCheckMachine');
    const packageBags = bags.filter(b => b.judgeTs).sort((a, b) => b.judgeTs - a.judgeTs).slice(0, 15);
    const scenarios = ['dual', 'dual', 'dbhit', 'dual', 'faceMiss', 'dbmiss', 'dual', 'faceMiss', 'dbhit', 'dual', 'faceMiss', 'dual', 'pendingDual', 'pendingDual', 'pendingView2'];
    packageBags.forEach((bag, i) => {
        const scenario = scenarios[i] || 'dual';
        const pending = scenario.startsWith('pending');
        const ts = pending ? now - (2 + (i % 3) * 3) * 60000 : Math.min(bag.judgeTs, now - 6 * 60000);
        const risk = bag.judgeResult;
        const ruleKey = risk === '违禁' ? 'contraband' : (risk === '可疑' ? 'suspicious' : 'bagNormal');
        const rule = ruleMap[ruleKey];
        const contraband = [];
        if (ruleKey !== 'bagNormal') {
            const name = bag.seized ? bag.seized.itemName : (bag.ai ? bag.ai.type : '刀具');
            contraband.push({ name, type: bag.seized ? bag.seized.typeName : (bag.ai ? bag.ai.type : '刀具'), qty: bag.seized ? bag.seized.qty : 1 });
            if (i % 3 === 1) contraband.push({ name: '充电宝', type: '电池/充电宝', qty: 1 });
        }
        const dev = machinePool.find(d => d.id === bag.machine) || pick(machinePool);
        const view1 = `V1-${bag.id}`, view2 = `V2-${bag.id}`;
        const deltaMs = scenario === 'dbhit' || i % 4 === 0 ? 17800 : 3400 + i * 210;
        const payload = {
            bagId: bag.id, passengerId: bag.owner, passengerName: bag.ownerName,
            weightKg: bag.weightKg, views: 2, view1, view2, deltaMs,
            contraband, judgeResult: risk
        };

        if (pending) {
            const view2Only = scenario === 'pendingView2';
            build(ts, ruleKey, dev, payload, {
                status: '待处理',
                binding: {
                    view: { mode: '双视角', status: '待绑定', views: [], detail: '双视角事件已上报，等待调度合并', deltaMs: null },
                    face: { status: '待绑定', attempts: 0, maxAttempts: 20, eventId: '', detail: '等待写入人脸轮询缓存' },
                    status: '处理中'
                },
                judge: { mode: '待判图', result: '', done: false, operator: '', durationMs: 0, contraband: [] },
                plan: { views: view2Only ? 'view2Only' : 'dual', dbHasView1: true, faceMatchAt: view2Only ? 1 : (i === 12 ? 2 : 4) }
            });
            return;
        }

        const rec = recognitionRecords.find(r => r.personId === bag.owner && Math.abs(r.ts - ts) < 5 * 60000)
            || recognitionRecords.find(r => r.personId === bag.owner);
        const faceEventId = rec ? rec.id : `FACE-${bag.id}`;
        const faceAttempts = Math.min(20, 2 + (i % 5) * 2);
        const dropped = scenario === 'faceMiss';

        let viewStatus = '已合并';
        let viewDetail = `同通道双视角间隔 ${(deltaMs / 1000).toFixed(1)}s（≤10s），已合并并累加违禁品数量`;
        let views = [view1, view2];
        if (scenario === 'dbhit' || deltaMs > 10000) {
            viewStatus = 'DB回查命中';
            viewDetail = '仅收到第二视角，写入 Redis 缓存并投递 10s 延迟队列；过期后回查数据库命中第一视角';
        } else if (scenario === 'dbmiss') {
            viewStatus = '回查未命中';
            views = [view2];
            viewDetail = '仅收到第二视角，10s 延迟队列过期且数据库无第一视角，按单视角事件继续';
        }

        const e = build(ts, ruleKey, dev, payload, {
            status: dropped ? '已丢弃' : '已处理',
            binding: {
                view: { mode: '双视角', status: viewStatus, views, detail: viewDetail, deltaMs },
                face: {
                    status: dropped ? '超时丢弃' : '已绑定',
                    attempts: dropped ? 20 : faceAttempts,
                    maxAttempts: 20,
                    eventId: dropped ? '' : faceEventId,
                    detail: dropped
                        ? '6s × 20 次（2 分钟）轮询未匹配人脸事件，包裹事件已从缓存删除'
                        : `第 ${faceAttempts} 次轮询命中人脸事件 ${faceEventId}，包裹属性写入该 EventId`
                },
                status: dropped ? '已丢弃' : '已完成'
            },
            judge: dropped ? { mode: '未判图', result: '', done: false, operator: '', durationMs: 0, contraband: [] } : {
                mode: rule.judgeMode, result: risk, done: true,
                operator: rule.judgeMode.startsWith('集中') ? '集中判图·高级席位' : '本地判图',
                durationMs: 2800 + i * 213, contraband
            },
            processedAt: fmtDateTime(ts + 15000),
            outcome: dropped ? '等待 2 分钟仍无人脸事件，包裹事件已删除'
                : (ruleKey === 'contraband' ? `已转违禁事件（危险），统计违禁品 ${contraband.reduce((s, c) => s + c.qty, 0)} 件`
                    : (rule.judgeMode.startsWith('集中') ? `集中判图复核结论：${risk}，转正常放行` : `本地判图结论：${risk}，放行`))
        });

        if (viewStatus !== '已合并') {
            viewCache.push({ key: `redis:view:${bag.channel}:${bag.id}`, channel: bag.channel, viewId: view2, eventId: e.id, expireAt: ts + 10000, status: '已过期', clearedAt: fmtDateTime(ts + 11000) });
            delayQueue.push({ id: `DQ-${e.id.slice(-4)}-${i}`, eventId: e.id, channel: bag.channel, viewId: view2, view1, enqueueAt: ts, expireAt: ts + 10000, status: '已过期', dbHasView1: viewStatus === 'DB回查命中', result: viewStatus === 'DB回查命中' ? '回查命中' : '回查未命中' });
        }
        if (i < 6) {
            faceQueue.push({
                id: `FQ-${e.id.slice(-4)}-${i}`, eventId: e.id, bagId: bag.id, passengerId: bag.owner,
                startedAt: ts, attempts: dropped ? 20 : faceAttempts, maxAttempts: 20,
                nextPollAt: ts + (dropped ? 120000 : faceAttempts * 6000),
                matchAt: dropped ? 0 : faceAttempts, status: dropped ? '超时丢弃' : '已绑定'
            });
        }
    });

    // ---------- 安检门：金属事件 / 客流事件 ----------
    const metalDoors = byKey('metalDoor');
    for (let i = 0; i < 8; i++) {
        const ts = now - (15 + i * 23) * 60000;
        const d = metalDoors[i % metalDoors.length];
        const metalValue = 24 + Math.round(Math.random() * 48);
        const abnormal = metalValue > 50;
        const faceStatus = ['已刷脸', '未刷脸', '未注册'][i % 3];
        build(ts, abnormal ? 'metalAlarm' : 'metalPass', d, {
            metalValue, threshold: 50,
            absValue: abnormal ? '异常' : '正常',
            increment: `${i % 4 === 1 ? '-' : '+'}${2 + (i * 3) % 14}`,
            negative: i % 5 === 4,
            faceStatus, inOut: i % 2 === 0 ? '进' : '出'
        }, {
            judge: localJudge(abnormal ? '异常' : '正常'),
            processedAt: fmtDateTime(ts + 3000),
            outcome: abnormal ? `本地告警中心判定金属报警（${faceStatus}），联动人工复检` : '金属值低于阈值，放行'
        });
    }
    for (let i = 0; i < 2; i++) {
        const ts = now - (30 + i * 40) * 60000;
        build(ts, 'flow', metalDoors[i], { inCount: 62 + i * 17, outCount: 55 + i * 14, ratePerMin: +(4.1 + i * 0.3).toFixed(1) }, {
            judge: localJudge('统计'), processedAt: fmtDateTime(ts + 1500), outcome: '进出客流计数写入客流态势'
        });
    }

    // ---------- 分类门：违禁品 + 数量/位置 + 客流 ----------
    const classifyDoors = byKey('classificationDoor');
    for (let i = 0; i < 3; i++) {
        const ts = now - (35 + i * 27) * 60000;
        const item = [
            { name: '刀具', qty: 1, position: '右侧背包侧袋' },
            { name: '液体', qty: 2, position: '外套左侧口袋' },
            { name: '电池/充电宝', qty: 1, position: '行李箱夹层' }
        ][i];
        build(ts, 'classify', classifyDoors[i % classifyDoors.length], {
            contraband: item, flowCount: 118 + i * 9, inOut: '进'
        }, {
            judge: localJudge('违禁', [item]), processedAt: fmtDateTime(ts + 4000),
            outcome: `分类门检出${item.name}（${item.qty} 件，${item.position}），转现场处置`
        });
    }

    // ---------- 明眸 / 抓拍机：人脸 + 温度 ----------
    const accessDevs = devices.filter(d => ['accessControl', 'accessVideo', 'personCertCompare'].includes(d.key));
    for (let i = 0; i < 8; i++) {
        const ts = now - (12 + i * 19) * 60000;
        const p = passengers[(i * 29) % passengers.length];
        const temperature = +(36.1 + ((i * 7) % 23) / 10).toFixed(1);
        const overTemp = temperature > 37.3;
        const ruleKey = (i === 3 || i === 6) ? 'unregistered' : (overTemp ? 'faceTemp' : 'faceRec');
        build(ts, ruleKey, accessDevs[i % accessDevs.length], {
            personId: ruleKey === 'unregistered' ? '-' : p.id,
            personName: ruleKey === 'unregistered' ? '未识别' : p.name,
            similarity: ruleKey === 'unregistered' ? 0 : +(88 + (i % 10)).toFixed(1),
            temperature, overTemp,
            registered: ruleKey !== 'unregistered'
        }, {
            judge: localJudge(ruleKey === 'faceTemp' ? '体温异常' : (ruleKey === 'unregistered' ? '未注册' : '识别成功')),
            processedAt: fmtDateTime(ts + 1200),
            outcome: ruleKey === 'faceTemp' ? `检测到 ${temperature}℃，转复测与过温人数统计`
                : (ruleKey === 'unregistered' ? '未注册人员，转人工核验' : '识别成功，写入通行台账')
        });
    }

    // ---------- 炸探 / 液探 ----------
    byKey('explosiveDetector').slice(0, 3).forEach((d, i) => {
        const ts = now - (48 + i * 55) * 60000;
        build(ts, 'explosive', d, { kind: '爆炸物', trace: ['TNT 微量', '硝酸铵', '黑火药'][i], result: '检出' }, {
            judge: localJudge('危险'), processedAt: fmtDateTime(ts + 2500), outcome: '痕量爆炸物检出，启动应急处置'
        });
    });
    byKey('liquidDetector').slice(0, 3).forEach((d, i) => {
        const ts = now - (42 + i * 60) * 60000;
        build(ts, 'combustible', d, { kind: '可燃物', liquid: ['汽油', '酒精', '香蕉水'][i], result: '检出' }, {
            judge: localJudge('异常'), processedAt: fmtDateTime(ts + 2000), outcome: '液体可燃物检出，转人工复检'
        });
    });

    // ---------- 姿态：离岗 + 行为 ----------
    const cameras = devices.filter(d => d.key === 'accessVideo');
    const posture = [
        { awayMin: 18, behavior: '离岗', rule: 'away' },
        { awayMin: 27, behavior: '离岗', rule: 'away' },
        { awayMin: 0, behavior: '瞌睡', rule: 'behavior' },
        { awayMin: 0, behavior: '抽烟', rule: 'behavior' },
        { awayMin: 0, behavior: '遮挡', rule: 'behavior' }
    ];
    posture.forEach((p, i) => {
        const ts = now - (25 + i * 14) * 60000;
        build(ts, p.rule, cameras[i % cameras.length], {
            employee: ['安检员·陈立峰', '判图员·刘晓芸', '安检员·何秀兰', '安检员·王磊', '安检员·赵敏'][i],
            post: `${(i % 3) + 1}号通道`, awayMin: p.awayMin, behavior: p.behavior,
            thresholdMin: 15
        }, {
            judge: localJudge(p.rule === 'away' ? '离岗超时' : '行为告警'),
            processedAt: fmtDateTime(ts + 5000),
            outcome: p.rule === 'away' ? `离岗 ${p.awayMin} 分钟超过配置阈值 15 分钟，通知班组长` : `识别到${p.behavior}行为，记录并提醒`
        });
    });

    rawEvents.sort((a, b) => b.ts - a.ts);

    // ---------- 态势（当日增长 / 连续日增长阈值） ----------
    const overTempCount = passengers.filter(p => p.temperature > 37.3).length;
    const seized = bags.filter(b => b.disposition === '开包查扣').length;
    const situation = [
        { key: 'bag', name: '包裹量态势', today: `${bags.length} 件`, threshold: '≥ 560 件', growth: '+8.3%', consecutive: 3, consecutiveLimit: 3, status: '预警', note: '当日量未破线，但连续 3 日增长达到阈值' },
        { key: 'flow', name: '客流态势', today: '4.6 人/分钟', threshold: '≥ 6 人/分钟', growth: '+5.1%', consecutive: 1, consecutiveLimit: 3, status: '正常', note: '高峰时段客流平稳' },
        { key: 'temp', name: '温度态势', today: `${overTempCount} 人`, threshold: '≥ 5 人', growth: '-2.0%', consecutive: 0, consecutiveLimit: 2, status: '正常', note: '过温旅客均已完成复测' },
        { key: 'contraband', name: '违禁品态势', today: `${seized} 件`, threshold: '≥ 20 件', growth: '+3.4%', consecutive: 1, consecutiveLimit: 3, status: '正常', note: '查获量与近 3 日均值持平' }
    ];

    // 交互式上报：写入一条待处理事件，由调度器推进
    const spawn = (at) => {
        const bag = pick(bags.filter(b => b.judgeTs));
        const dev = pick(machinePool);
        const contraband = Math.random() > 0.6
            ? [{ name: pick(['刀具', '充电宝', '液体']), type: pick(['刀具', '电池/充电宝', '液体']), qty: 1 }]
            : [];
        const ruleKey = contraband.length ? 'contraband' : (Math.random() > 0.5 ? 'suspicious' : 'bagNormal');
        return build(at, ruleKey, dev, {
            bagId: bag.id, passengerId: bag.owner, passengerName: bag.ownerName,
            weightKg: bag.weightKg, views: 2,
            view1: `V1-${bag.id}-${String(100 + localSeq % 900)}`, view2: `V2-${bag.id}`,
            deltaMs: 4200, contraband,
            judgeResult: ruleKey === 'contraband' ? '违禁' : (ruleKey === 'suspicious' ? '可疑' : '正常')
        }, {
            status: '待处理',
            binding: {
                view: { mode: '双视角', status: '待绑定', views: [], detail: '双视角事件已上报，等待调度合并', deltaMs: null },
                face: { status: '待绑定', attempts: 0, maxAttempts: 20, eventId: '', detail: '等待写入人脸轮询缓存' },
                status: '处理中'
            },
            judge: { mode: '待判图', result: '', done: false, operator: '', durationMs: 0, contraband: [] },
            plan: { views: Math.random() > 0.75 ? 'view2Only' : 'dual', dbHasView1: Math.random() > 0.3, faceMatchAt: 2 + Math.floor(Math.random() * 3) }
        });
    };

    return {
        site: EVENT_SITE, clock: 0, rules, deviceCache,
        rawEvents, viewCache, delayQueue, faceQueue, situation, build, spawn
    };
}

// 缓存富化：读 rule:* / dev:* 缓存，填充告警等级与站点通道
function enrichRawEvent(e, eng, now, summary) {
    if (e.cache.readAt2) return;
    const rule = eng.rules.find(r => r.key === e.typeKey);
    const dc = eng.deviceCache.find(c => c.deviceId === e.deviceId);
    if (rule) { e.level = rule.level; e.cache.ruleKey = rule.cacheKey; }
    if (dc) { e.site = dc.site; e.channel = dc.channel; e.channelName = dc.channelName; e.cache.deviceKey = dc.cacheKey; }
    e.cache.readAt2 = fmtDateTime(now);
    summary.enriched++;
}

function enqueueFace(e, eng, now) {
    if (e.binding.face.status !== '待绑定') return;
    const plan = e.plan || {};
    e.binding.face.status = '轮询中';
    e.binding.face.attempts = 0;
    e.binding.face.detail = '包裹与人脸事件写入缓存，每 6s 轮询一次，最多 20 次（2 分钟）';
    eng.faceQueue.unshift({
        id: `FQ-${e.id.slice(-5)}`, eventId: e.id, bagId: e.payload.bagId,
        passengerId: e.payload.passengerId,
        startedAt: now, attempts: 0, maxAttempts: 20, nextPollAt: now + 6000,
        matchAt: plan.faceMatchAt || 3, status: '轮询中'
    });
}

function pollFaceEntry(q, eng, store, now, summary) {
    q.attempts += 1;
    q.nextPollAt = now + 6000;
    const e = eng.rawEvents.find(x => x.id === q.eventId);
    if (!e) { q.status = '事件已删除'; return; }
    e.binding.face.attempts = q.attempts;
    const rec = store.recognitionRecords.find(r => r.personId === e.payload.passengerId);
    const faceId = rec ? rec.id : `FACE-${e.payload.bagId || e.id}`;
    e.binding.face.detail = `第 ${q.attempts} 次轮询（每 6s），等待人脸事件…`;

    if (q.matchAt && q.attempts >= q.matchAt) {
        q.status = '已绑定';
        e.binding.face.status = '已绑定';
        e.binding.face.eventId = faceId;
        e.payload.faceEventId = faceId;
        e.binding.face.detail = `第 ${q.attempts} 次轮询命中人脸事件 ${faceId}，包裹属性已写入该 EventId`;
        summary.faceBound++;
        maybeJudge(e, eng, store, now, summary);
    } else if (q.attempts >= q.maxAttempts) {
        q.status = '超时丢弃';
        e.binding.face.status = '超时丢弃';
        e.binding.face.detail = '6s × 20 次（2 分钟）未匹配人脸事件';
        e.status = '已丢弃';
        e.outcome = '等待 2 分钟仍无人脸事件，包裹事件已从缓存删除';
        summary.faceDropped++;
    }
}

function expireDelayEntry(q, eng, store, now, summary) {
    q.status = '已过期';
    summary.expired++;
    const e = eng.rawEvents.find(x => x.id === q.eventId);
    if (!e) return;
    if (q.dbHasView1) {
        e.binding.view.status = 'DB回查命中';
        e.binding.view.views = [q.view1, q.viewId];
        e.binding.view.detail = '延迟队列 10s 过期，回查数据库补全第一视角，完成双视角合并';
        q.result = '回查命中';
        summary.dbHit++;
    } else {
        e.binding.view.status = '回查未命中';
        e.binding.view.views = [q.viewId];
        e.binding.view.detail = '延迟队列过期且数据库无第一视角，按单视角事件继续';
        q.result = '回查未命中';
        summary.dbMiss++;
    }
    const vc = eng.viewCache.find(v => v.eventId === e.id);
    if (vc) { vc.status = q.dbHasView1 ? '已合并' : '已清理'; vc.clearedAt = fmtDateTime(now); }
    if (e.binding.face.status === '待绑定') { enqueueFace(e, eng, now); return; }
    maybeJudge(e, eng, store, now, summary);
}

function maybeJudge(e, eng, store, now, summary) {
    if (e.judge.done || e.status === '已丢弃') return;
    if (e.source === '安检机') {
        if (['待绑定', '延迟等待'].includes(e.binding.view.status)) return;
        if (['待绑定', '轮询中'].includes(e.binding.face.status)) return;
    }
    const rule = eng.rules.find(r => r.key === e.typeKey) || eng.rules[0];
    const judged = e.payload.judgeResult
        || (e.typeKey === 'contraband' ? '违禁' : (e.typeKey === 'suspicious' ? '可疑' : '正常'));
    e.judge = {
        mode: rule.judgeMode, result: judged, done: true,
        operator: rule.judgeMode.startsWith('集中') ? '集中判图·高级席位' : '本地告警中心',
        durationMs: 2600 + Math.round(Math.random() * 2600),
        contraband: e.payload.contraband || []
    };
    e.binding.status = '已完成';
    e.status = '已处理';
    e.processedAt = fmtDateTime(now);
    if (e.typeKey === 'contraband') {
        e.outcome = `已转违禁事件（危险），统计违禁品 ${e.judge.contraband.reduce((s, c) => s + (c.qty || 1), 0)} 件`;
    } else if (rule.judgeMode.startsWith('集中')) {
        e.outcome = `集中判图复核结论：${judged}`;
    } else {
        e.outcome = `本地告警中心判定：${judged}`;
    }
    summary.judged++;
}

function processRawEvent(e, eng, store, now, summary) {
    enrichRawEvent(e, eng, now, summary);
    if (e.source === '安检机') {
        if (e.binding.view.status === '待绑定') {
            const plan = e.plan || {};
            if (plan.views === 'view2Only') {
                e.binding.view.status = '延迟等待';
                e.binding.view.detail = '仅收到第二视角，事件写入 Redis 视角缓存，视角 ID 投递 10s 延迟队列';
                eng.viewCache.unshift({
                    key: `redis:view:${e.channel}:${e.payload.bagId}`, channel: e.channel,
                    viewId: e.payload.view2, eventId: e.id, expireAt: now + 10000, status: '等待第一视角'
                });
                eng.delayQueue.unshift({
                    id: `DQ-${e.id.slice(-5)}`, eventId: e.id, channel: e.channel,
                    viewId: e.payload.view2, view1: e.payload.view1,
                    enqueueAt: now, expireAt: now + 10000, status: '等待中', dbHasView1: !!plan.dbHasView1
                });
                summary.delayed++;
                return;
            }
            e.binding.view.status = '已合并';
            e.binding.view.views = [e.payload.view1, e.payload.view2];
            e.binding.view.deltaMs = e.payload.deltaMs;
            e.binding.view.detail = `同通道双视角间隔 ${(e.payload.deltaMs / 1000).toFixed(1)}s（≤10s），已合并并累加违禁品`;
            summary.merged++;
        }
        if (e.binding.view.status === '延迟等待') return;
        if (e.binding.face.status === '待绑定') { enqueueFace(e, eng, now); return; }
    }
    maybeJudge(e, eng, store, now, summary);
}

// 调度一轮：时钟 +10s，处理待办、过期延迟队列、人脸轮询
export function runEventTick() {
    const store = getStore();
    const eng = store.eventEngine;
    eng.clock += 10000;
    const now = Date.now() + eng.clock;
    const summary = { advance: 10, enriched: 0, merged: 0, delayed: 0, expired: 0, dbHit: 0, dbMiss: 0, faceBound: 0, faceDropped: 0, judged: 0 };

    eng.rawEvents.filter(e => e.status === '待处理').slice(0, 3).forEach(e => processRawEvent(e, eng, store, now, summary));
    eng.delayQueue.filter(q => q.status === '等待中' && q.expireAt <= now).forEach(q => expireDelayEntry(q, eng, store, now, summary));
    eng.faceQueue.filter(q => q.status === '轮询中' && q.nextPollAt <= now).forEach(q => pollFaceEntry(q, eng, store, now, summary));

    store.auditLogs.unshift({
        time: fmtDateTime(now), user: '事件引擎·调度器',
        action: `处理一轮事件：富化 ${summary.enriched}、双视角 ${summary.merged}、延迟过期 ${summary.expired}、人脸绑定 ${summary.faceBound}、判图 ${summary.judged}`,
        target: 'EVENT-ENGINE'
    });
    return summary;
}

// 模拟设备上报一条待处理事件
export function ingestDeviceEvent() {
    const store = getStore();
    const eng = store.eventEngine;
    const now = Date.now() + eng.clock;
    const e = eng.spawn(now);
    store.auditLogs.unshift({ time: fmtDateTime(now), user: '事件引擎·接入网关', action: `设备上报事件 ${e.id}（${e.deviceName} / ${e.type}），已入缓存富化队列`, target: e.id });
    return e;
}

// 引擎指标汇总（页面与导航徽标共用）
export function eventEngineStats(store = getStore()) {
    const eng = store.eventEngine;
    const evts = eng.rawEvents;
    const count = fn => evts.filter(fn).length;
    return {
        total: evts.length,
        enriched: count(e => !!e.cache.readAt2),
        merged: count(e => e.binding.view.status === '已合并' || e.binding.view.status === 'DB回查命中'),
        dbHit: count(e => e.binding.view.status === 'DB回查命中'),
        singleView: count(e => e.binding.view.status === '回查未命中'),
        faceBound: count(e => e.binding.face.status === '已绑定'),
        faceDropped: count(e => e.binding.face.status === '超时丢弃'),
        central: count(e => (e.judge.mode || '').startsWith('集中')),
        local: count(e => e.judge.mode === '本地'),
        contraband: count(e => e.typeKey === 'contraband'),
        pending: count(e => e.status === '待处理'),
        dropped: count(e => e.status === '已丢弃'),
        delayWaiting: eng.delayQueue.filter(q => q.status === '等待中').length,
        faceWaiting: eng.faceQueue.filter(q => q.status === '轮询中').length
    };
}

// ---------- 排班计划（按班组对应班次，全员每日单班） ----------
function makeShiftPlan(employees) {
    return SHIFT_DEFS.map(def => ({
        key: def.key,
        team: def.team,
        range: def.range,
        startH: def.startH,
        endH: def.endH,
        members: employees.filter(e => e.team === def.team).map(e => e.id),
        postNote: def.key === '早班' ? '客流高峰全岗开放，6 条通道运行' : '夜间值守，保留 2 条通道 + 集中判图远程在岗'
    }));
}

// 当前时刻所处班次
export function currentShiftDef() {
    const h = new Date().getHours();
    return (h >= 8 && h < 20) ? SHIFT_DEFS[0] : SHIFT_DEFS[1];
}

// 当班员工（可按岗位过滤）：集中判图/工单派工/验收人下拉均来源于此
export function onDutyEmployees(role) {
    const store = getStore();
    const shift = store.shifts.find(s => s.key === currentShiftDef().key) || store.shifts[0];
    const list = store.employees.filter(e => shift.members.includes(e.id));
    return role ? list.filter(e => e.role === role) : list;
}

// 换班：两名员工互换班次（同步调整班组，留下审计与事件）
export function swapShiftMember(empId, replacementId) {
    const store = getStore();
    const a = store.employees.find(e => e.id === empId);
    const b = store.employees.find(e => e.id === replacementId);
    if (!a || !b) return { ok: false, msg: '人员不存在' };
    const sa = store.shifts.find(s => s.members.includes(a.id));
    const sb = store.shifts.find(s => s.members.includes(b.id));
    if (!sa || !sb || sa === sb) return { ok: false, msg: '请选择不同班次的人员对调' };
    sa.members = sa.members.map(id => id === a.id ? b.id : id);
    sb.members = sb.members.map(id => id === b.id ? a.id : id);
    const ta = a.team; a.team = b.team; b.team = ta;
    const msg = `换班：${a.name}（${a.role}）↔ ${b.name}（${b.role}）`;
    store.auditLogs.unshift({ time: fmtDateTime(Date.now()), user: store.currentUser.name, action: msg, target: `${sa.key}/${sb.key}` });
    store.events.unshift({
        id: `EVT-${fmtDate(Date.now()).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
        time: fmtDateTime(Date.now()), _ts: Date.now(), device: '排班管理',
        type: '勤务调整', status: 'status-normal', statusName: '', processStatus: '已处理',
        details: `${msg}，由当班队长审核确认`
    });
    return { ok: true, msg };
}

// 班次业务量（按判图时刻归班统计）
export function shiftWorkload(store) {
    const bucket = ts => { const h = new Date(ts).getHours(); return (h >= 8 && h < 20) ? '早班' : '晚班'; };
    const rows = [];
    store.shifts.forEach(s => {
        const judged = store.bags.filter(b => b.status === 'judged' && bucket(b.judgeTs || b.scanTs) === s.key);
        rows.push({
            shift: s.key, range: s.range, members: s.members.length,
            judged: judged.length,
            danger: judged.filter(b => b.judgeResult === '违禁').length,
            seized: judged.filter(b => b.disposition === '开包查扣').length,
            alarms: store.alarms.filter(a => bucket(a.ts) === s.key).length
        });
    });
    return rows;
}

// ---------- 维保工单 ----------
const FAULT_LIB = {
    offline: ['链路中断/心跳丢失', '电源模块故障', '网口异常'],
    warning: ['机身温度偏高', '网络丢包', '自检报错 E-12']
};
const PART_LIB = ['以太网模块 ×1', '温度传感器 ×1', '电源适配器 ×1', '传送带皮带 ×1', '（未更换配件）'];

function makeWorkorders(devices, employees) {
    const techs = employees.filter(e => e.role === '维修工程师');
    const now = Date.now();
    const list = [];
    const mkId = ts => `WO-${fmtDate(ts).replace(/-/g, '')}-${String(700 + seq.wo++)}`;

    // 1) 故障设备 → 在流程中的工单（离线=待派工紧急，告警=维修中）
    devices.filter(d => d.status !== 'online').forEach((d, i) => {
        const ts = now - (30 + i * 47 + Math.floor(Math.random() * 60)) * 60000;
        const isOff = d.status === 'offline';
        const tech = techs[i % techs.length];
        list.push({
            id: mkId(ts), deviceId: d.id, deviceName: d.displayName, channel: d.location,
            category: d.category, ip: d.ip, model: d.model,
            faultType: isOff ? FAULT_LIB.offline[i % 3] : FAULT_LIB.warning[i % 3],
            level: isOff ? '紧急' : '普通',
            status: isOff ? '待派工' : '维修中',
            ts, time: fmtDateTime(ts),
            description: isOff ? `${d.displayName}(${d.ip}) 心跳超时离线，远程指令无法下发` : `${d.displayName} 运行参数异常，触发黄色告警`,
            technician: isOff ? '' : tech.name,
            techId: isOff ? '' : tech.id,
            dispatchTs: isOff ? 0 : ts + 10 * 60000,
            slaMin: isOff ? 60 : 240,
            repairNote: '', parts: '', finishTs: 0, acceptor: '', acceptTs: 0, acceptNote: ''
        });
    });

    // 2) 历史已完成工单（从在线设备中取有维护痕迹的，构完整改闭环样本）
    [12, 25, 40].forEach((idx, i) => {
        const d = devices[idx];
        const ts = now - (6 + i * 3) * 3600000;
        const dispatchTs = ts + 12 * 60000;
        const finishTs = dispatchTs + (35 + i * 18) * 60000;
        const acceptTs = finishTs + 22 * 60000;
        const tech = techs[i % techs.length];
        list.push({
            id: mkId(ts), deviceId: d.id, deviceName: d.displayName, channel: d.location,
            category: d.category, ip: d.ip, model: d.model,
            faultType: ['图像背景噪声大', '传送带异响', '固件升级后自检失败'][i],
            level: i === 0 ? '紧急' : '普通', status: '已完成',
            ts, time: fmtDateTime(ts),
            description: '巡逻岗人工报修，不影响通行但需限期整改',
            technician: tech.name, techId: tech.id, dispatchTs,
            slaMin: 120,
            repairNote: ['清洁闪烁探测器并重新标定', '张紧轮调整 + 润滑', '回滚固件至稳定版本并重测'][i],
            parts: PART_LIB[i], finishTs,
            acceptor: '值班队长·' + ['王振宇', '李慧芝'][i % 2], acceptTs,
            acceptNote: '复检正常，同意归档'
        });
    });

    list.sort((a, b) => b.ts - a.ts);
    return list;
}

export function createRepairOrder(deviceId, faultType, level, description) {
    const store = getStore();
    const dev = store.devices.find(d => d.id === deviceId);
    if (!dev) return { ok: false, msg: '设备不存在' };
    if (store.workorders.some(w => w.deviceId === deviceId && w.status !== '已完成')) {
        return { ok: false, msg: `${dev.displayName} 已有未完成工单，请勿重复报修` };
    }
    const now = Date.now();
    const wo = {
        id: `WO-${fmtDate(now).replace(/-/g, '')}-${String(700 + seq.wo++)}`,
        deviceId: dev.id, deviceName: dev.displayName, channel: dev.location,
        category: dev.category, ip: dev.ip, model: dev.model,
        faultType: faultType || '其他异常', level: level || '普通', status: '待派工',
        ts: now, time: fmtDateTime(now), description: description || `${dev.displayName} 人工报修`,
        technician: '', techId: '', dispatchTs: 0, slaMin: level === '紧急' ? 60 : 240,
        repairNote: '', parts: '', finishTs: 0, acceptor: '', acceptTs: 0, acceptNote: ''
    };
    store.workorders.unshift(wo);
    store.events.unshift({
        id: `EVT-${fmtDate(now).replace(/-/g, '')}-${String(10000 + seq.evt++)}`,
        time: fmtDateTime(now), _ts: now, device: dev.displayName,
        type: '维保报修', status: wo.level === '紧急' ? 'status-danger' : 'status-warning', statusName: '',
        processStatus: '未处理', details: `已创建报修工单 ${wo.id}：${wo.faultType}`
    });
    store.auditLogs.unshift({ time: fmtDateTime(now), user: store.currentUser.name, action: `创建报修工单 ${wo.id}（${dev.displayName}）`, target: dev.id });
    return { ok: true, wo };
}

export function dispatchWorkorder(woId, techName) {
    const store = getStore();
    const wo = store.workorders.find(w => w.id === woId);
    if (!wo || wo.status !== '待派工') return null;
    const tech = store.employees.find(e => e.name === techName && e.role === '维修工程师');
    wo.status = '维修中';
    wo.technician = tech ? tech.name : techName;
    wo.techId = tech ? tech.id : '';
    wo.dispatchTs = Date.now();
    store.auditLogs.unshift({ time: fmtDateTime(Date.now()), user: store.currentUser.name, action: `工单 ${wo.id} 派工给 ${wo.technician}`, target: wo.deviceId });
    return wo;
}

export function finishRepair(woId, repairNote, parts) {
    const store = getStore();
    const wo = store.workorders.find(w => w.id === woId);
    if (!wo || wo.status !== '维修中') return null;
    wo.status = '待验收';
    wo.repairNote = repairNote || wo.repairNote;
    wo.parts = parts || '（未更换配件）';
    wo.finishTs = Date.now();
    // 备件库存自动扣减（格式：配件名 ×数量）
    const m = /^(.+?)\s*×\s*(\d+)$/.exec(wo.parts);
    if (m) {
        const part = store.spareParts.find(p => p.name === m[1].trim());
        if (part) {
            part.stock = Math.max(0, part.stock - parseInt(m[2], 10));
            wo.partsDeducted = parseInt(m[2], 10);
        }
    }
    return wo;
}

// 验收：通过 → 设备恢复在线 + 关联告警闭环；退回 → 回到维修中
export function acceptWorkorder(woId, acceptor, pass, comment) {
    const store = getStore();
    const wo = store.workorders.find(w => w.id === woId);
    if (!wo || wo.status !== '待验收') return null;
    const now = Date.now();
    if (!pass) {
        wo.status = '维修中';
        wo.finishTs = 0;
        wo.acceptNote = comment || '故障未排除，退回重修';
        return wo;
    }
    wo.status = '已完成';
    wo.acceptor = acceptor;
    wo.acceptTs = now;
    wo.acceptNote = comment || '复检正常，同意归档';
    const dev = store.devices.find(d => d.id === wo.deviceId);
    if (dev) {
        dev.status = 'online';
        dev.lastMaintenance = fmtDate(now);
    }
    store.alarms.forEach(a => {
        if (a.device === wo.deviceName && a.status === '未处理') {
            a.status = '已处理';
            a.operator = `维修工程师·${wo.technician}`;
            a.handleTime = fmtDateTime(now);
            a.handleNote = `工单 ${wo.id} 验收通过，故障已修复`;
        }
    });
    store.events.forEach(e => {
        if (e.device === wo.deviceName && e.processStatus !== '已处理' && /设备离线|网络异常|维保报修/.test(e.type)) {
            e.processStatus = '已处理';
            e.handler = wo.technician;
            e.handleTime = fmtDateTime(now);
        }
    });
    store.auditLogs.unshift({ time: fmtDateTime(now), user: acceptor, action: `工单 ${wo.id} 验收通过，${wo.deviceName} 恢复在线`, target: wo.deviceId });
    return wo;
}

// ---------- 判图员绩效考核 ----------
export function perfStats(store) {
    const judges = store.employees.filter(e => e.role === '判图员');
    const dutyIds = (store.shifts.find(s => s.key === currentShiftDef().key) || {}).members || [];
    const rows = judges.map(j => {
        const mine = store.bags.filter(b => b.status === 'judged' && b.judgeOperatorId === j.id);
        const danger = mine.filter(b => b.judgeResult === '违禁').length;
        const suspect = mine.filter(b => b.judgeResult === '可疑').length;
        const avgDelay = mine.length ? mine.reduce((s, b) => s + (b.reviewDelayMin || 0), 0) / mine.length : 0;
        const qcList = mine.filter(b => b.qc);
        const missed = qcList.filter(b => b.qc.result === '漏判').length;
        const sloppy = qcList.filter(b => b.qc.result === '处置不规范').length;
        const accuracy = qcList.length ? (qcList.length - missed - sloppy) / qcList.length * 100 : null;
        const score = Math.max(60, Math.min(100, Math.round(
            88 + danger * 0.4 - missed * 6 - sloppy * 2 + Math.min(6, mine.length / 12) - Math.min(4, Math.max(0, avgDelay - 30) / 25)
        )));
        return {
            id: j.id, name: j.name, team: j.team, onDuty: dutyIds.includes(j.id),
            judged: mine.length, danger, suspect,
            avgDelay: +avgDelay.toFixed(1), qc: qcList.length, missed, sloppy,
            accuracy: accuracy === null ? null : +accuracy.toFixed(1),
            score, bags: mine
        };
    }).sort((a, b) => b.score - a.score);
    return rows;
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
    const shifts = makeShiftPlan(employees);
    const workorders = makeWorkorders(devices, employees);
    const spareParts = makeSpareParts();
    const dataSources = makeDataSources(devices, Date.now());
    const pipelines = makePipelines();
    const storages = makeStorages();
    const subscriptions = makeSubscriptions();
    const warehouseTables = makeWarehouseTables();
    const dataServices = makeDataServices();
    const qualityRules = makeQualityRules();
    const eventEngine = makeEventEngine({ bags, devices, passengers, recognitionRecords: face.recognitionRecords });

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
        shifts,
        workorders,
        spareParts,
        dataSources, pipelines, storages, subscriptions,
        warehouseTables, dataServices, qualityRules,
        eventEngine,
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
