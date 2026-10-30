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
