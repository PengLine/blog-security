import { generateMockData, paginateData } from './utils.js';

// 配置类型映射
const configTypeMap = {
    device: '设备配置',
    event: '事件配置',
    system: '系统配置'
};

// 分页变量
let currentConfigPage = 1;
const configsPerPage = 20;
let allConfigs = [];

// 全局初始化函数
window.initConfigModule = function() {
    loadConfigs();
};

// 加载配置数据
function loadConfigs() {
    const data = generateMockData();
    allConfigs = data.configs;
    renderConfigs(paginateData(allConfigs, currentConfigPage, configsPerPage));
    renderConfigPagination();
}

// 当配置管理模块显示时加载数据
const configModule = document.getElementById('config');
if (configModule) {
    // 初始加载
    loadConfigs();
    
    // 设置筛选事件
    setupFilters();
}

// 渲染配置列表
export function renderConfigs(configs) {
    const tbody = document.getElementById('configsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    configs.forEach(config => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${config.id}</td>
            <td>${config.name}</td>
            <td>${configTypeMap[config.type] || config.type}</td>
            <td>${config.createTime}</td>
            <td>${config.updateTime}</td>
            <td>
                <button class="btn btn-small btn-info" onclick="viewConfig('${config.id}')">查看</button>
                <button class="btn btn-small btn-primary" onclick="editConfig('${config.id}')">编辑</button>
                <button class="btn btn-small btn-danger" onclick="deleteConfig('${config.id}')">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染配置分页
function renderConfigPagination() {
    const tableSection = document.querySelector('.table-section');
    if (!tableSection) return;
    
    let paginationDiv = tableSection.querySelector('.pagination-page');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-page';
        tableSection.appendChild(paginationDiv);
    }
    
    const totalPages = Math.ceil(allConfigs.length / configsPerPage);
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    paginationDiv.innerHTML = `
        <button class="btn btn-secondary" ${currentConfigPage <= 1 ? 'disabled' : ''} onclick="window.changeConfigPage(${currentConfigPage - 1})">上一页</button>
        <span class="page-info">第 ${currentConfigPage} 页，共 ${totalPages} 页</span>
        <button class="btn btn-secondary" ${currentConfigPage >= totalPages ? 'disabled' : ''} onclick="window.changeConfigPage(${currentConfigPage + 1})">下一页</button>
    `;
}

// 切换配置页码
window.changeConfigPage = function(page) {
    currentConfigPage = page;
    renderConfigs(paginateData(allConfigs, currentConfigPage, configsPerPage));
    renderConfigPagination();
};

// 设置筛选功能
function setupFilters() {
    const filterBtn = document.getElementById('filterBtn');
    const resetBtn = document.getElementById('resetBtn');
    const typeFilter = document.getElementById('configTypeFilter');
    const nameFilter = document.getElementById('configNameFilter');
    
    filterBtn.addEventListener('click', () => {
        const data = generateMockData();
        let filteredConfigs = [...data.configs];
        
        // 按类型筛选
        const typeValue = typeFilter.value;
        if (typeValue) {
            filteredConfigs = filteredConfigs.filter(config => config.type === typeValue);
        }
        
        // 按名称筛选
        const nameValue = nameFilter.value.trim();
        if (nameValue) {
            filteredConfigs = filteredConfigs.filter(config => 
                config.name.includes(nameValue)
            );
        }
        
        renderConfigs(filteredConfigs);
    });
    
    resetBtn.addEventListener('click', () => {
        typeFilter.value = '';
        nameFilter.value = '';
        loadConfigs();
    });
}

// 查看配置
window.viewConfig = function(configId) {
    alert(`查看配置：${configId}`);
    // 这里可以实现查看配置详情的逻辑
};

// 编辑配置
window.editConfig = function(configId) {
    alert(`编辑配置：${configId}`);
    // 这里可以实现编辑配置的逻辑
};

// 删除配置
window.deleteConfig = function(configId) {
    if (confirm('确定要删除这个配置吗？')) {
        alert(`删除配置：${configId}`);
        // 这里可以实现删除配置的逻辑
        loadConfigs(); // 重新加载配置列表
    }
};
