import { getStore, addToBlacklist } from './db.js';
import { toast, openModal, kvTableHTML, maskId, maskPhone, timeAgo } from './utils.js';

let mockData = {};
let currentPersonnel = null;

function initPage() {
    const store = getStore();
    // 人员库直接复用全系统统一的旅客档案（含人脸录入状态）
    mockData = {
        personnel: store.passengers.map(p => ({
            id: p.id, name: p.name, gender: p.gender, age: p.age,
            idCard: p.idCard, phone: p.phone,
            department: p.department, faceStatus: p.faceEnrolled ? '已录入' : '未录入',
            createTime: p.checkInTime
        })),
        enrollHistory: store.enrollHistory,
        recognitionRecords: store.recognitionRecords,
        blacklist: store.blacklist
    };
    initTabs();
    renderPersonnelList(mockData.personnel.slice(0, 60));
    renderEnrollHistory(mockData.enrollHistory.slice(0, 30));
    renderRecognitionRecords(mockData.recognitionRecords.slice(0, 50));
    renderBlacklist(mockData.blacklist);
    renderStats();
    updatePersonnelSelect();
}

function initTabs() {
    const tabNavItems = document.querySelectorAll('.tab-nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    tabNavItems.forEach(item => {
        item.onclick = () => {
            const tabId = item.getAttribute('data-tab');
            tabNavItems.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        };
    });
}

function renderPersonnelList(personnel) {
    const tbody = document.getElementById('personnelTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const store = getStore();
    const blackIds = new Set(store.blacklist.map(x => x.personId));

    personnel.forEach(person => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${person.id}</td>
            <td>${person.name}${blackIds.has(person.id) ? ' <span class="chip chip-danger">黑名单</span>' : ''}</td>
            <td>${person.gender}</td>
            <td>${person.age}</td>
            <td title="出于隐私保护已脱敏">${maskId(person.idCard)}</td>
            <td>${maskPhone(person.phone)}</td>
            <td>${person.department}</td>
            <td><span class="status-tag ${person.faceStatus === '已录入' ? 'status-normal' : 'status-warning'}">${person.faceStatus}</span></td>
            <td>
                <button class="btn btn-primary" data-edit="${person.id}">编辑</button>
                ${person.faceStatus === '未录入' ? `<button class="btn btn-success" data-enroll="${person.id}">录入人脸</button>` : ''}
                ${!blackIds.has(person.id) ? `<button class="btn btn-danger" data-black="${person.id}">加黑名单</button>` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => editPersonnel(btn.dataset.edit));
    tbody.querySelectorAll('[data-enroll]').forEach(btn => btn.onclick = () => enrollPersonFace(btn.dataset.enroll));
    tbody.querySelectorAll('[data-black]').forEach(btn => btn.onclick = () => {
        const p = mockData.personnel.find(x => x.id === btn.dataset.black);
        quickAddBlacklist(p);
    });
}

function renderEnrollHistory(history) {
    const tbody = document.getElementById('enrollHistoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    history.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.time}</td>
            <td>${record.personId}</td>
            <td>${record.personName}</td>
            <td>${record.method}</td>
            <td><span class="status-tag ${record.status === '成功' ? 'status-normal' : 'status-danger'}">${record.status}</span></td>
            <td>${record.similarity}%</td>
            <td>${record.operator || ''}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderRecognitionRecords(records) {
    const tbody = document.getElementById('recognitionRecordsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    records.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.time}<div style="font-size:11px;color:#909399">${timeAgo(record.ts)}</div></td>
            <td>${record.personId}</td>
            <td>${record.personName}</td>
            <td>${record.device || record.channel}</td>
            <td>${record.similarity}%</td>
            <td><span class="status-tag ${record.status === '识别成功' ? 'status-normal' : 'status-warning'}">${record.status}</span></td>
            <td>${record.temperature}℃</td>
            <td><button class="btn btn-primary" data-rd="${record.id}">查看</button></td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-rd]').forEach(btn => btn.onclick = () => {
        const r = mockData.recognitionRecords.find(x => x.id === btn.dataset.rd);
        if (r) openModal({
            title: `识别详情 - ${r.id}`, width: 540,
            bodyHTML: kvTableHTML([
                ['识别时间', r.time], ['设备', r.device], ['通道', r.channel],
                ['人员', `${r.personName}（${r.personId}）`], ['相似度', `${r.similarity}%`],
                ['结果', r.status], ['现场体温', `${r.temperature}℃`]
            ])
        });
    });
}

function renderBlacklist(blacklist) {
    const tbody = document.getElementById('blacklistTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    blacklist.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.personId}</td>
            <td>${item.personName}</td>
            <td>${maskId(item.idCard)}</td>
            <td>${item.joinTime}</td>
            <td>${item.reason}</td>
            <td>${item.by || ''}</td>
            <td><button class="btn btn-danger" data-rm="${item.personId}">移除</button></td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-rm]').forEach(btn => btn.onclick = () => {
        const store = getStore();
        store.blacklist = store.blacklist.filter(x => x.personId !== btn.dataset.rm);
        toast('已移出黑名单，该旅客恢复正常通行核验', 'info');
        initPage();
    });
}

function renderStats() {
    const store = getStore();
    const recs = store.recognitionRecords;
    const today = new Date().toDateString();
    const todayRecs = recs.filter(r => new Date(r.ts).toDateString() === today);
    const success = todayRecs.filter(r => r.status === '识别成功').length;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('todayRecognitionCount', todayRecs.length);
    set('recognitionSuccessRate', todayRecs.length ? (success / todayRecs.length * 100).toFixed(1) + '%' : '-');
    set('averageSimilarity', success ? (todayRecs.reduce((s, r) => s + parseFloat(r.similarity), 0) / (success || 1)).toFixed(1) + '%' : '-');
    set('unrecognizedCount', todayRecs.length - success);
}

function updatePersonnelSelect() {
    const select = document.getElementById('enrollPersonSelect');
    if (!select) return;
    select.innerHTML = '';
    mockData.personnel.filter(p => p.faceStatus === '未录入').slice(0, 50).forEach(person => {
        const option = document.createElement('option');
        option.value = person.id;
        option.textContent = `${person.name} (${person.id})`;
        select.appendChild(option);
    });
    if (select.options.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '全部人员已录入人脸';
        select.appendChild(option);
    }
}

// 编辑人员（身份证脱敏展示，可保存修改）
function editPersonnel(personId) {
    currentPersonnel = mockData.personnel.find(p => p.id === personId);
    if (!currentPersonnel) return;
    document.getElementById('personId').value = currentPersonnel.id;
    document.getElementById('personName').value = currentPersonnel.name;
    document.getElementById('personGender').value = currentPersonnel.gender;
    document.getElementById('personAge').value = currentPersonnel.age;
    document.getElementById('personIdCard').value = currentPersonnel.idCard;
    document.getElementById('personPhone').value = currentPersonnel.phone;
    document.getElementById('personDepartment').value = currentPersonnel.department;
    toast(`已载入 ${currentPersonnel.name} 的档案，修改后点击「更新」保存`, 'info');
}

function updatePersonnel() {
    if (!currentPersonnel) { toast('请先点击列表中的「编辑」选择人员', 'warning'); return; }
    const name = document.getElementById('personName').value.trim();
    const age = document.getElementById('personAge').value;
    const idCard = document.getElementById('personIdCard').value.trim();
    if (!name || !age || !idCard) { toast('请填写姓名、年龄和身份证号', 'warning'); return; }

    const store = getStore();
    const p = store.passengers.find(x => x.id === currentPersonnel.id);
    if (p) {
        p.name = name;
        p.age = parseInt(age);
        p.idCard = idCard;
        p.phone = document.getElementById('personPhone').value.trim() || p.phone;
        p.department = document.getElementById('personDepartment').value;
        syncPersonnelView();
        toast(`人员档案 ${name} 已更新，同步至通行/判图链路`, 'success');
        clearPersonnelForm();
    }
}

function addPersonnel() {
    const name = document.getElementById('personName').value.trim();
    const idCard = document.getElementById('personIdCard').value.trim();
    const age = document.getElementById('personAge').value;
    if (!name || !idCard || !age) { toast('请填写姓名、年龄和身份证号（必填）', 'warning'); return; }

    const store = getStore();
    const now = Date.now();
    const p = {
        id: `P-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(9000 + store.passengers.length)}`,
        name, gender: document.getElementById('personGender').value, age: parseInt(age),
        idCard, phone: document.getElementById('personPhone').value.trim(),
        department: document.getElementById('personDepartment').value,
        faceEnrolled: false, temperature: 36.5, checkInTime: new Date().toLocaleString(), _ts: now,
        channel: `CH-${1 + Math.floor(Math.random() * 5)}`
    };
    store.passengers.unshift(p);
    syncPersonnelView();
    toast(`人员 ${name}（${p.id}）建档成功`, 'success');
    clearPersonnelForm();
}

function deletePersonnel() {
    const personIdInput = document.getElementById('personId').value;
    if (!personIdInput) { toast('请先「编辑」选择人员或直接删除？请先载入人员', 'warning'); return; }
    const store = getStore();
    store.passengers = store.passengers.filter(x => x.id !== personIdInput);
    syncPersonnelView();
    toast(`人员 ${personIdInput} 已注销`, 'info');
    clearPersonnelForm();
}

function syncPersonnelView() {
    const store = getStore();
    mockData.personnel = store.passengers.map(p => ({
        id: p.id, name: p.name, gender: p.gender, age: p.age,
        idCard: p.idCard, phone: p.phone, department: p.department,
        faceStatus: p.faceEnrolled ? '已录入' : '未录入', createTime: p.checkInTime
    }));
    renderPersonnelList(mockData.personnel.slice(0, 60));
    updatePersonnelSelect();
}

function clearPersonnelForm() {
    ['personId', 'personName', 'personAge', 'personIdCard', 'personPhone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const g = document.getElementById('personGender');
    if (g) g.value = '男';
    const d = document.getElementById('personDepartment');
    if (d) d.value = '普通乘客';
    currentPersonnel = null;
}

// 人脸录入流程
window.startEnroll = function() {
    const container = document.getElementById('faceCanvasContainer');
    if (!container) return;
    container.innerHTML = '<div style="color:#409eff;">正在调用通道摄像头，请人员正对镜头…</div>';
    setTimeout(() => {
        container.innerHTML = `
            <div style="text-align:center;color:#67c23a;">
                <div style="font-size:48px;">☑</div>
                已捕获人脸图像，质量分 92/100<br>
                <span style="color:#909399;font-size:12px;">遮挡检测通过 · 光照合格 · 姿态角 3.2°</span>
            </div>`;
    }, 1200);
};

window.saveEnroll = function() {
    const select = document.getElementById('enrollPersonSelect');
    const personId = select.value;
    const person = mockData.personnel.find(p => p.id === personId);
    if (!person) { toast('请选择要录入的人员', 'warning'); return; }

    const store = getStore();
    const p = store.passengers.find(x => x.id === personId);
    if (p) p.faceEnrolled = true;
    store.enrollHistory.unshift({
        id: `ENR-${Date.now()}`, ts: Date.now(),
        time: new Date().toLocaleString(),
        personId: person.id, personName: person.name,
        method: document.getElementById('enrollMethodSelect').value === 'camera' ? '摄像头' : '上传图片',
        status: '成功', similarity: (90 + Math.random() * 9).toFixed(1),
        operator: `值机安检员·${store.currentUser.name}`
    });
    toast(`${person.name} 人脸录入成功，已同步至明眸设备人脸库`, 'success');
    initPage();
    document.querySelector('.tab-nav-item[data-tab="personnel"]').click();
};

window.cancelEnroll = function() {
    const container = document.getElementById('faceCanvasContainer');
    if (container) container.innerHTML = '<span style="color:#909399;">请点击开始录入或上传图片</span>';
};

window.handleFaceImageUpload = function() {
    const fileInput = document.getElementById('faceImageUpload');
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const container = document.getElementById('faceCanvasContainer');
        if (container) container.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:350px;object-fit:contain;">`;
    };
    reader.readAsDataURL(file);
};

function enrollPersonFace(personId) {
    document.querySelector('.tab-nav-item[data-tab="enroll"]').click();
    const sel = document.getElementById('enrollPersonSelect');
    if (sel && Array.from(sel.options).some(o => o.value === personId)) sel.value = personId;
}

// 黑名单（选择人员库人员，联动通行拦截）
function quickAddBlacklist(person) {
    const store = getStore();
    openModal({
        title: `加入黑名单 - ${person.name}`,
        width: 500,
        bodyHTML: `
            <div class="form-grid">
                <label>人员</label><input class="form-control" value="${person.name}（${person.id}）" disabled>
                <label>原因</label>
                <select class="form-control" id="blkReason">
                    <option>携带违禁品</option><option>冲闯安检通道</option>
                    <option>冒用他人证件</option><option>扰乱安检秩序</option><option>其他原因</option>
                </select>
            </div>
            <p style="margin-top:10px;font-size:12px;color:#e6a23c;">加入后该人员在通行管理将被自动拦截（拒绝通行）。</p>`,
        actions: [{
            label: '确认加入', className: 'btn-danger',
            onClick: (close) => {
                const reason = document.getElementById('blkReason').value;
                const r = addToBlacklist(person.id, reason);
                if (r.ok) { toast(`${person.name} 已加入黑名单（${reason}）`, 'success'); initPage(); close(); }
                else toast(r.msg, 'error');
            }
        }]
    });
}

window.addBlacklist = function() {
    const pid = document.getElementById('blacklistPersonId').value.trim();
    const reason = document.getElementById('blacklistReason').value.trim();
    if (!pid) { toast('请填写人员ID或姓名', 'warning'); return; }
    const r = addToBlacklist(pid, reason);
    if (r.ok) { toast(`${r.item.personName} 已加入黑名单`, 'success'); initPage(); }
    else toast(r.msg, 'error');
};

window.removeBlacklist = function() {
    const pid = document.getElementById('blacklistPersonId').value.trim();
    if (!pid) { toast('请填写要移除的人员ID', 'warning'); return; }
    const store = getStore();
    const before = store.blacklist.length;
    store.blacklist = store.blacklist.filter(x => x.personId !== pid && x.personName !== pid);
    if (store.blacklist.length < before) { toast('已移出黑名单', 'success'); initPage(); }
    else toast('该人员不在黑名单中', 'warning');
};

window.addPersonnel = addPersonnel;
window.updatePersonnel = updatePersonnel;
window.deletePersonnel = deletePersonnel;
window.editPersonnel = editPersonnel;
window.clearPersonnelForm = clearPersonnelForm;

// 全局初始化函数
window.initFaceModule = function() {
    initPage();
};
