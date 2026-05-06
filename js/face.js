import { generateMockData } from './utils.js';

let mockData = {};
let currentPersonnel = null;

function initPage() {
    mockData = generateFaceMockData();
    initTabs();
    renderPersonnelList(mockData.personnel);
    renderEnrollHistory(mockData.enrollHistory);
    renderRecognitionRecords(mockData.recognitionRecords);
    renderBlacklist(mockData.blacklist);
    renderStats();
    updatePersonnelSelect();
}

function generateFaceMockData() {
    const personnel = [];
    for (let i = 0; i < 15; i++) {
        const gender = Math.random() > 0.5 ? '男' : '女';
        const department = ['普通乘客', '工作人员', 'VIP'][Math.floor(Math.random() * 3)];
        const faceStatus = Math.random() > 0.3 ? '已录入' : '未录入';
        personnel.push({
            id: `PERS-${Date.now()}-${i}`,
            name: `人员${i + 1}`,
            gender: gender,
            age: Math.floor(Math.random() * 50) + 18,
            idCard: `110101${1970 + Math.floor(Math.random() * 50)}${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
            phone: `138${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
            department: department,
            faceStatus: faceStatus,
            createTime: new Date(Date.now() - Math.random() * 31536000000).toLocaleString()
        });
    }

    const enrollHistory = [];
    for (let i = 0; i < 10; i++) {
        const person = personnel[Math.floor(Math.random() * personnel.length)];
        enrollHistory.push({
            id: `ENROLL-${Date.now()}-${i}`,
            time: new Date(Date.now() - Math.random() * 86400000).toLocaleString(),
            personId: person.id,
            personName: person.name,
            method: Math.random() > 0.5 ? '摄像头' : '上传图片',
            status: Math.random() > 0.8 ? '失败' : '成功',
            similarity: Math.random() > 0.8 ? (Math.random() * 10 + 85).toFixed(1) : (Math.random() * 10 + 90).toFixed(1)
        });
    }

    const recognitionRecords = [];
    for (let i = 0; i < 20; i++) {
        const person = personnel[Math.floor(Math.random() * personnel.length)];
        const status = Math.random() > 0.8 ? '未识别' : '识别成功';
        recognitionRecords.push({
            id: `REC-${Date.now()}-${i}`,
            time: new Date(Date.now() - Math.random() * 86400000).toLocaleString(),
            personId: status === '识别成功' ? person.id : '未知',
            personName: status === '识别成功' ? person.name : '未知',
            channel: `channel${Math.floor(Math.random() * 5) + 1}`,
            similarity: status === '识别成功' ? (Math.random() * 10 + 85).toFixed(1) : '0.0',
            status: status,
            temperature: (Math.random() * 2 + 36).toFixed(1)
        });
    }

    const blacklist = [];
    for (let i = 0; i < 5; i++) {
        const person = personnel[Math.floor(Math.random() * personnel.length)];
        blacklist.push({
            id: `BLACK-${Date.now()}-${i}`,
            personId: person.id,
            personName: person.name,
            joinTime: new Date(Date.now() - Math.random() * 31536000000).toLocaleString(),
            reason: ['携带违禁品', '体温异常', '闹事行为', '其他原因'][Math.floor(Math.random() * 4)]
        });
    }

    const stats = {
        todayRecognitionCount: Math.floor(Math.random() * 1000) + 200,
        recognitionSuccessRate: (Math.random() * 5 + 95).toFixed(1),
        averageSimilarity: (Math.random() * 5 + 90).toFixed(1),
        unrecognizedCount: Math.floor(Math.random() * 50) + 10
    };

    return { personnel, enrollHistory, recognitionRecords, blacklist, stats };
}

function initTabs() {
    const tabNavItems = document.querySelectorAll('.tab-nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    tabNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            
            tabNavItems.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function renderPersonnelList(personnel) {
    const tbody = document.getElementById('personnelTableBody');
    tbody.innerHTML = '';

    personnel.forEach(person => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${person.id}</td>
            <td>${person.name}</td>
            <td>${person.gender}</td>
            <td>${person.age}</td>
            <td>${person.idCard}</td>
            <td>${person.phone}</td>
            <td>${person.department}</td>
            <td><span class="status-tag ${person.faceStatus === '已录入' ? 'status-normal' : 'status-warning'}">${person.faceStatus}</span></td>
            <td>
                <button class="btn btn-primary" onclick="editPersonnel('${person.id}')">编辑</button>
                <button class="btn btn-danger" onclick="deletePersonnel('${person.id}')">删除</button>
                ${person.faceStatus === '未录入' ? `<button class="btn btn-success" onclick="enrollPersonFace('${person.id}')">录入人脸</button>` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderEnrollHistory(history) {
    const tbody = document.getElementById('enrollHistoryTableBody');
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
            <td><button class="btn btn-primary" onclick="viewEnrollDetail('${record.id}')">查看</button></td>
        `;
        tbody.appendChild(row);
    });
}

function renderRecognitionRecords(records) {
    const tbody = document.getElementById('recognitionRecordsTableBody');
    tbody.innerHTML = '';

    records.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.time}</td>
            <td>${record.personId}</td>
            <td>${record.personName}</td>
            <td>${record.channel}</td>
            <td>${record.similarity}%</td>
            <td><span class="status-tag ${record.status === '识别成功' ? 'status-normal' : 'status-warning'}">${record.status}</span></td>
            <td>${record.temperature}°C</td>
            <td><button class="btn btn-primary" onclick="viewRecognitionDetail('${record.id}')">查看</button></td>
        `;
        tbody.appendChild(row);
    });
}

function renderBlacklist(blacklist) {
    const tbody = document.getElementById('blacklistTableBody');
    tbody.innerHTML = '';

    blacklist.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.personId}</td>
            <td>${item.personName}</td>
            <td>${item.joinTime}</td>
            <td>${item.reason}</td>
            <td><button class="btn btn-danger" onclick="removeBlacklist('${item.id}')">移除</button></td>
        `;
        tbody.appendChild(row);
    });
}

function renderStats() {
    document.getElementById('todayRecognitionCount').textContent = mockData.stats.todayRecognitionCount;
    document.getElementById('recognitionSuccessRate').textContent = `${mockData.stats.recognitionSuccessRate}%`;
    document.getElementById('averageSimilarity').textContent = `${mockData.stats.averageSimilarity}%`;
    document.getElementById('unrecognizedCount').textContent = mockData.stats.unrecognizedCount;
}

function updatePersonnelSelect() {
    const select = document.getElementById('enrollPersonSelect');
    if (!select) return;
    
    select.innerHTML = '';
    mockData.personnel.forEach(person => {
        const option = document.createElement('option');
        option.value = person.id;
        option.textContent = `${person.name} (${person.id})`;
        select.appendChild(option);
    });
}

function addPersonnel() {
    const name = document.getElementById('personName').value;
    const gender = document.getElementById('personGender').value;
    const age = document.getElementById('personAge').value;
    const idCard = document.getElementById('personIdCard').value;
    const phone = document.getElementById('personPhone').value;
    const department = document.getElementById('personDepartment').value;

    if (!name || !age || !idCard) {
        alert('请填写必填字段');
        return;
    }

    const newPersonnel = {
        id: `PERS-${Date.now()}`,
        name: name,
        gender: gender,
        age: parseInt(age),
        idCard: idCard,
        phone: phone,
        department: department,
        faceStatus: '未录入',
        createTime: new Date().toLocaleString()
    };

    mockData.personnel.push(newPersonnel);
    renderPersonnelList(mockData.personnel);
    updatePersonnelSelect();
    clearPersonnelForm();
}

function updatePersonnel() {
    if (!currentPersonnel) {
        alert('请先选择要更新的人员');
        return;
    }

    const name = document.getElementById('personName').value;
    const gender = document.getElementById('personGender').value;
    const age = document.getElementById('personAge').value;
    const idCard = document.getElementById('personIdCard').value;
    const phone = document.getElementById('personPhone').value;
    const department = document.getElementById('personDepartment').value;

    if (!name || !age || !idCard) {
        alert('请填写必填字段');
        return;
    }

    const index = mockData.personnel.findIndex(p => p.id === currentPersonnel.id);
    if (index !== -1) {
        mockData.personnel[index] = {
            ...currentPersonnel,
            name: name,
            gender: gender,
            age: parseInt(age),
            idCard: idCard,
            phone: phone,
            department: department
        };
        renderPersonnelList(mockData.personnel);
        clearPersonnelForm();
    }
}

function deletePersonnel(personId) {
    if (personId) {
        mockData.personnel = mockData.personnel.filter(p => p.id !== personId);
    } else {
        const personIdInput = document.getElementById('personId').value;
        if (!personIdInput) {
            alert('请先选择要删除的人员');
            return;
        }
        mockData.personnel = mockData.personnel.filter(p => p.id !== personIdInput);
    }
    renderPersonnelList(mockData.personnel);
    updatePersonnelSelect();
    clearPersonnelForm();
}

function editPersonnel(personId) {
    currentPersonnel = mockData.personnel.find(p => p.id === personId);
    if (currentPersonnel) {
        document.getElementById('personId').value = currentPersonnel.id;
        document.getElementById('personName').value = currentPersonnel.name;
        document.getElementById('personGender').value = currentPersonnel.gender;
        document.getElementById('personAge').value = currentPersonnel.age;
        document.getElementById('personIdCard').value = currentPersonnel.idCard;
        document.getElementById('personPhone').value = currentPersonnel.phone;
        document.getElementById('personDepartment').value = currentPersonnel.department;
    }
}

function clearPersonnelForm() {
    document.getElementById('personId').value = '';
    document.getElementById('personName').value = '';
    document.getElementById('personGender').value = '男';
    document.getElementById('personAge').value = '';
    document.getElementById('personIdCard').value = '';
    document.getElementById('personPhone').value = '';
    document.getElementById('personDepartment').value = '普通乘客';
    currentPersonnel = null;
}

function startEnroll() {
    const container = document.getElementById('faceCanvasContainer');
    if (!container) return;
    
    container.innerHTML = '<div style="color: #409eff;">正在录入人脸...</div>';
}

function saveEnroll() {
    const personId = document.getElementById('enrollPersonSelect').value;
    const method = document.getElementById('enrollMethodSelect').value;
    
    const person = mockData.personnel.find(p => p.id === personId);
    if (person) {
        person.faceStatus = '已录入';
        
        const newEnrollRecord = {
            id: `ENROLL-${Date.now()}`,
            time: new Date().toLocaleString(),
            personId: person.id,
            personName: person.name,
            method: method === 'camera' ? '摄像头' : '上传图片',
            status: '成功',
            similarity: (Math.random() * 10 + 90).toFixed(1)
        };
        mockData.enrollHistory.unshift(newEnrollRecord);
        
        renderPersonnelList(mockData.personnel);
        renderEnrollHistory(mockData.enrollHistory);
        updatePersonnelSelect();
        
        alert('人脸录入成功');
    }
}

function cancelEnroll() {
    const container = document.getElementById('faceCanvasContainer');
    if (!container) return;
    
    container.innerHTML = '<span style="color: #909399;">请点击开始录入或上传图片</span>';
}

function handleFaceImageUpload() {
    const fileInput = document.getElementById('faceImageUpload');
    const file = fileInput.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const container = document.getElementById('faceCanvasContainer');
            if (!container) return;
            
            container.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 350px; object-fit: contain;">`;
        };
        reader.readAsDataURL(file);
    }
}

function viewEnrollDetail(recordId) {
    const record = mockData.enrollHistory.find(r => r.id === recordId);
    if (record) {
        alert(`录入详情：\nID: ${record.id}\n时间: ${record.time}\n人员: ${record.personName} (${record.personId})\n方式: ${record.method}\n状态: ${record.status}\n相似度: ${record.similarity}%`);
    }
}

function viewRecognitionDetail(recordId) {
    const record = mockData.recognitionRecords.find(r => r.id === recordId);
    if (record) {
        alert(`识别详情：\nID: ${record.id}\n时间: ${record.time}\n人员: ${record.personName} (${record.personId})\n通道: ${record.channel}\n状态: ${record.status}\n相似度: ${record.similarity}%\n体温: ${record.temperature}°C`);
    }
}

function enrollPersonFace(personId) {
    document.querySelector('.tab-nav-item[data-tab="enroll"]').click();
    document.getElementById('enrollPersonSelect').value = personId;
}

function addBlacklist() {
    const personId = document.getElementById('blacklistPersonId').value;
    const personName = document.getElementById('blacklistPersonName').value;
    const reason = document.getElementById('blacklistReason').value;

    if (!personId || !personName || !reason) {
        alert('请填写完整信息');
        return;
    }

    const newBlacklistItem = {
        id: `BLACK-${Date.now()}`,
        personId: personId,
        personName: personName,
        joinTime: new Date().toLocaleString(),
        reason: reason
    };

    mockData.blacklist.push(newBlacklistItem);
    renderBlacklist(mockData.blacklist);
    
    document.getElementById('blacklistPersonId').value = '';
    document.getElementById('blacklistPersonName').value = '';
    document.getElementById('blacklistReason').value = '';
}

function removeBlacklist(blacklistId) {
    if (blacklistId) {
        mockData.blacklist = mockData.blacklist.filter(item => item.id !== blacklistId);
    } else {
        const personId = document.getElementById('blacklistPersonId').value;
        mockData.blacklist = mockData.blacklist.filter(item => item.personId !== personId);
    }
    renderBlacklist(mockData.blacklist);
}

// 全局初始化函数
window.initFaceModule = function() {
    initPage();
};

const faceModule = document.getElementById('face');
if (faceModule) {
    initPage();
    faceModule.addEventListener('DOMNodeInsertedIntoDocument', initPage);
}

window.addPersonnel = addPersonnel;
window.updatePersonnel = updatePersonnel;
window.deletePersonnel = deletePersonnel;
window.editPersonnel = editPersonnel;
window.clearPersonnelForm = clearPersonnelForm;
window.startEnroll = startEnroll;
window.saveEnroll = saveEnroll;
window.cancelEnroll = cancelEnroll;
window.handleFaceImageUpload = handleFaceImageUpload;
window.viewEnrollDetail = viewEnrollDetail;
window.viewRecognitionDetail = viewRecognitionDetail;
window.enrollPersonFace = enrollPersonFace;
window.addBlacklist = addBlacklist;
window.removeBlacklist = removeBlacklist;