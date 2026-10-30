import { getStore, judgeBag } from './db.js';
import { toast, openModal, kvTableHTML, timeAgo, refreshNavBadges } from './utils.js';

let currentJudgeBag = null;
let sessionJudged = 0;

// 确定性伪随机（同一包裹图像稳定）
function mulberry32(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// 用 Canvas 模拟 X 光双视角图像（有机物橙、无机物蓝、混合物绿）
function drawXrayImage(canvas, bag) {
    const rand = mulberry32(bag.imageSeed);
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = '#04101c';
    ctx.fillRect(0, 0, W, H);

    const views = [0, 1];
    views.forEach(v => {
        const ox = v * W / 2;
        const vw = W / 2;
        // 行李轮廓
        ctx.fillStyle = 'rgba(30, 58, 95, 0.55)';
        ctx.fillRect(ox + 14, 16, vw - 28, H - 32);
        ctx.strokeStyle = '#1e3a5f';
        ctx.strokeRect(ox + 14, 16, vw - 28, H - 32);

        // 物品团块
        const blobCount = 10 + Math.floor(rand() * 8);
        for (let i = 0; i < blobCount; i++) {
            const kind = rand();
            const color = kind < 0.4 ? `rgba(230,162,60,${0.35 + rand() * 0.4})`    // 有机物
                : kind < 0.7 ? `rgba(64,158,255,${0.4 + rand() * 0.4})`             // 无机/金属
                : `rgba(103,194,58,${0.35 + rand() * 0.35})`;                       // 混合
            ctx.fillStyle = color;
            const bw = 20 + rand() * (vw / 3);
            const bh = 10 + rand() * 50;
            const bx = ox + 20 + rand() * (vw - 60);
            const by = 24 + rand() * (H - 80);
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate((rand() - 0.5) * 0.6);
            ctx.fillRect(0, 0, bw, bh);
            ctx.restore();
        }

        // 传送带基准线
        ctx.strokeStyle = 'rgba(144,147,153,0.4)';
        ctx.beginPath();
        ctx.moveTo(ox + 14, H - 24);
        ctx.lineTo(ox + vw - 14, H - 24);
        ctx.stroke();
    });

    // 中缝分隔
    ctx.strokeStyle = '#0a1929';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.lineWidth = 1;

    // AI 标注框（若有预判标记，落在右侧视角某团块上）
    if (bag.ai) {
        const levelColor = bag.ai.level === 'severe' ? '#f56c6c' : '#e6a23c';
        const bx = W / 2 + 30 + (bag.imageSeed % 60);
        const by = 40 + (bag.imageSeed % 50);
        const bw = 110, bh = 66;
        ctx.strokeStyle = levelColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = levelColor;
        ctx.font = 'bold 12px Microsoft YaHei';
        ctx.fillText(`AI: ${bag.ai.label} ${bag.ai.confidence}%`, bx, by - 6);
        ctx.lineWidth = 1;
    }

    // 角标信息
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px Microsoft YaHei';
    ctx.fillText(`VIEW-A / ${bag.machineName}`, 20, H - 8);
    ctx.fillText(`VIEW-B / ${bag.scanTime}`, W / 2 + 20, H - 8);
}

// 渲染判图队列
function renderJudgeQueue() {
    const judgeList = document.getElementById('judgeList');
    const store = getStore();
    if (!judgeList) return;

    const filter = document.getElementById('judgeQueueFilter');
    let bags = filter && filter.value === 'all'
        ? store.bags.slice(0, 60)
        : store.bags.filter(b => b.status === 'pending');

    judgeList.innerHTML = '';
    bags.forEach(bag => {
        const el = document.createElement('div');
        el.className = 'judge-item';
        el.dataset.id = bag.id;
        const statusTag = bag.status === 'pending'
            ? '<span class="status-tag status-warning">待处理</span>'
            : bag.judgeResult === '违禁' ? '<span class="status-tag status-danger">违禁</span>'
            : bag.judgeResult === '可疑' ? '<span class="status-tag status-processing">可疑</span>'
            : '<span class="status-tag status-normal">已完成</span>';
        const waitMin = Math.max(1, Math.floor((Date.now() - bag.scanTs) / 60000));
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${bag.machineName}</strong>
                ${statusTag}
            </div>
            <div style="font-size:12px;color:#909399;margin:5px 0;">${bag.scanTime} · 等待 ${waitMin} 分钟</div>
            <div style="font-size:12px;">旅客：${bag.ownerName} · ${bag.weightKg}kg</div>
            ${bag.ai ? `<div style="font-size:12px;margin-top:3px;">
                <span class="chip ${bag.ai.level === 'severe' ? 'chip-danger' : 'chip-warn'}">${bag.ai.label} ${bag.ai.confidence}%</span>
            </div>` : '<div style="font-size:12px;color:#67c23a;margin-top:3px;">AI：正常</div>'}
            <div style="font-size:11px;color:#909399;margin-top:5px;">${bag.id}</div>
        `;
        el.onclick = () => selectBag(bag, el);
        judgeList.appendChild(el);
    });

    // 队列统计
    const stat = document.getElementById('judgeQueueStat');
    const pending = store.bags.filter(b => b.status === 'pending').length;
    const doneToday = store.bags.filter(b => b.status === 'judged').length;
    if (stat) stat.innerHTML = `待判 <b style="color:#e6a23c">${pending}</b> 件 · 今日已判 <b style="color:#67c23a">${doneToday}</b> 件 · 本次在岗已判 <b style="color:#409eff">${sessionJudged}</b> 件`;
    refreshNavBadges();
}

// 选中一个包裹并渲染图像
function selectBag(bag, el) {
    document.querySelectorAll('.judge-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
    currentJudgeBag = bag;

    const container = document.querySelector('.image-container');
    container.innerHTML = '';
    container.style.position = 'relative';

    const canvas = document.createElement('canvas');
    canvas.width = 860;
    canvas.height = 400;
    canvas.style.cssText = 'max-width:100%;max-height:100%;transition:transform .25s ease;border-radius:4px;';
    drawXrayImage(canvas, bag);

    // 图像工具（放大/缩小/旋转/反色）
    const tools = document.createElement('div');
    tools.className = 'img-tools';
    let scale = 1, rotation = 0, inverted = false;
    const apply = () => {
        canvas.style.transform = `scale(${scale}) rotate(${rotation}deg)`;
        canvas.style.filter = inverted ? 'invert(1)' : 'none';
    };
    const mkBtn = (label, fn) => {
        const b = document.createElement('button');
        b.className = 'btn btn-secondary';
        b.textContent = label;
        b.onclick = fn;
        return b;
    };
    tools.appendChild(mkBtn('放大', () => { scale = Math.min(2.5, scale + 0.2); apply(); }));
    tools.appendChild(mkBtn('缩小', () => { scale = Math.max(0.4, scale - 0.2); apply(); }));
    tools.appendChild(mkBtn('旋转', () => { rotation = (rotation + 90) % 360; apply(); }));
    tools.appendChild(mkBtn('反色', () => { inverted = !inverted; apply(); }));
    tools.appendChild(mkBtn('重置', () => { scale = 1; rotation = 0; inverted = false; apply(); }));

    container.appendChild(canvas);
    container.appendChild(tools);

    // 判图信息栏
    const meta = document.getElementById('judgeMetaBar');
    meta.style.display = 'flex';
    meta.innerHTML = `
        <span>包裹 <b>${bag.id}</b></span>
        <span>旅客 <b>${bag.ownerName}</b>（${bag.owner}）</span>
        <span>通道 <b>${bag.channelName}</b></span>
        <span>重量 <b>${bag.weightKg}kg</b></span>
        <span>过检 <b>${bag.scanTime}</b></span>
        ${bag.ai ? `<span>AI预判 <b style="color:${bag.ai.level === 'severe' ? '#f56c6c' : '#e6a23c'}">${bag.ai.label}（${bag.ai.confidence}%）</b></span>` : '<span>AI预判 <b style="color:#67c23a">正常</b></span>'}
        ${bag.status === 'judged' ? `<span>已处置 <b>${bag.judgeResult} / ${bag.disposition}</b>（${bag.judgeOperator}）</span>` : ''}
    `;

    // 绑定结果按钮状态
    const judged = bag.status === 'judged';
    ['btnJudgeNormal', 'btnJudgeSuspicious', 'btnJudgeContraband'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = judged;
    });
}

// 执行判图
function doJudge(result) {
    if (!currentJudgeBag) { toast('请先选择一个待判图包裹', 'warning'); return; }
    if (currentJudgeBag.status === 'judged') { toast('该包裹已完成判图', 'warning'); return; }

    const operatorSel = document.getElementById('judgeOperatorSelect');
    const operator = operatorSel ? operatorSel.value : getStore().currentUser.name;
    const bag = judgeBag(currentJudgeBag.id, result, operator);
    sessionJudged++;

    if (result === '违禁') {
        openModal({
            title: '确认违禁 - 已生成查扣登记',
            width: 560,
            bodyHTML: kvTableHTML([
                ['包裹', `${bag.id}（${bag.ownerName}）`],
                ['判图员', operator],
                ['疑似物品', bag.ai ? bag.ai.label : '-'],
                ['后续流程', '已自动创建《查扣物品登记》，并推送危险级告警。请前往「处置交接」完成开包登记与民警交接。']
            ]),
            actions: [{
                label: '前往处置交接', className: 'btn-danger',
                onClick: (close) => { close(); document.querySelector('.nav-item[data-nav="handoff"]').click(); }
            }]
        });
    } else {
        toast(`判图完成：${bag.id} → ${result}（处置：${bag.disposition}）`, result === '正常' ? 'success' : 'warning');
    }

    renderJudgeQueue();
    loadNextJudgeImage();
}

// 加载下一张待判图
function loadNextJudgeImage() {
    const store = getStore();
    const next = store.bags.find(b => b.status === 'pending');
    if (next) {
        const el = document.querySelector(`.judge-item[data-id="${next.id}"]`);
        selectBag(next, el || document.querySelector('.judge-item'));
        if (!el) {
            // 「今日全部」视图下未渲染出该项，重新按待判队列渲染
            const filter = document.getElementById('judgeQueueFilter');
            if (filter) { filter.value = 'pending'; renderJudgeQueue(); }
            const el2 = document.querySelector(`.judge-item[data-id="${next.id}"]`);
            selectBag(next, el2);
        }
    } else {
        currentJudgeBag = null;
        const container = document.querySelector('.image-container');
        if (container) container.innerHTML = '<div style="color:#67c23a;font-size:16px;">队列为空，所有包裹已判图 ✔</div>';
        const meta = document.getElementById('judgeMetaBar');
        if (meta) meta.style.display = 'none';
    }
}

// 初始化模块
window.initJudgeModule = function() {
    const store = getStore();

    // 判图员下拉
    const opSel = document.getElementById('judgeOperatorSelect');
    if (opSel) {
        const judges = store.employees.filter(e => e.role === '判图员');
        opSel.innerHTML = judges.map(e => `<option value="${e.name}">${e.name}（${e.team}）</option>`).join('');
        store.currentUser = judges[0];
        opSel.onchange = () => {
            store.currentUser = store.employees.find(e => e.name === opSel.value);
            toast(`已切换当班判图员：${store.currentUser.name}`, 'info');
        };
    }

    const filter = document.getElementById('judgeQueueFilter');
    if (filter) filter.onchange = renderJudgeQueue;

    const refreshBtn = document.getElementById('judgeRefreshBtn');
    if (refreshBtn) refreshBtn.onclick = () => { renderJudgeQueue(); toast('队列已刷新', 'info'); };

    document.getElementById('btnJudgeNormal').onclick = () => doJudge('正常');
    document.getElementById('btnJudgeSuspicious').onclick = () => doJudge('可疑');
    document.getElementById('btnJudgeContraband').onclick = () => doJudge('违禁');
    document.getElementById('btnJudgeNext').onclick = loadNextJudgeImage;

    // 快捷键
    document.onkeydown = (e) => {
        if (!document.getElementById('judge') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.key === '1') doJudge('正常');
        else if (e.key === '2') doJudge('可疑');
        else if (e.key === '3') doJudge('违禁');
        else if (e.key === 'ArrowRight') loadNextJudgeImage();
    };

    renderJudgeQueue();
    loadNextJudgeImage();
};
