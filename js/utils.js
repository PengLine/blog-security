// ============================================================
// 全局工具：统一数据出口 + toast / modal / CSV / 图表 / 导航
// ============================================================

import { getStore } from './db.js';

// 资源版本号：每次整页加载时生成一次，用于绕过浏览器对旧版 HTML/JS 的缓存
// （会话内保持稳定，模块仍只求值一次，不会重复注册事件监听）
const ASSET_VER = Date.now();

// 兼容旧接口：统一从业务数据中枢取数（各页面数据相互关联，不再每次随机生成）
export function generateMockData() {
    const store = getStore();
    const deviceStatusMap = {
        online: { name: "在线", class: "status-normal" },
        offline: { name: "离线", class: "status-danger" },
        warning: { name: "告警", class: "status-warning" }
    };
    return {
        store,
        events: store.events,
        devices: store.devices.map(d => ({ ...d, status: deviceStatusMap[d.status] })),
        alarms: store.alarms,
        judgeItems: store.bags.filter(b => b.status === 'pending'),
        configs: store.configs
    };
}

// ---------- 全局 UI 能力：toast ----------
export function toast(message, type = 'info', duration = 2600) {
    let wrap = document.getElementById('toastWrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'toastWrap';
        wrap.className = 'toast-wrap';
        document.body.appendChild(wrap);
    }
    const colors = { info: '#409eff', success: '#67c23a', warning: '#e6a23c', error: '#f56c6c' };
    const el = document.createElement('div');
    el.className = 'toast-item';
    el.style.borderLeftColor = colors[type] || colors.info;
    el.innerHTML = `<span class="toast-dot" style="background:${colors[type] || colors.info}"></span><span>${message}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 400); }, duration);
}

// ---------- 全局 UI 能力：modal ----------
/**
 * 通用弹窗
 * options: { title, bodyHTML, actions: [{ label, className, onClick(closeFn, mask) }], width }
 * 返回关闭函数
 */
export function openModal(options) {
    closeModal();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.id = 'globalModalMask';
    const actions = (options.actions || []).map((a, i) => `<button class="btn ${a.className || 'btn-secondary'}" data-act="${i}">${a.label}</button>`).join('');
    mask.innerHTML = `
        <div class="modal" style="max-width:${options.width || 640}px">
            <div class="modal-header">${options.title || ''}<span class="modal-x">×</span></div>
            <div class="modal-body">${options.bodyHTML || ''}</div>
            <div class="modal-footer">${actions}<button class="btn btn-secondary" data-act="close">关闭</button></div>
        </div>`;
    document.body.appendChild(mask);
    const closeFn = () => mask.remove();
    mask.querySelector('.modal-x').onclick = closeFn;
    mask.addEventListener('click', e => { if (e.target === mask) closeFn(); });
    (options.actions || []).forEach((a, i) => {
        const btn = mask.querySelector(`[data-act="${i}"]`);
        if (btn) btn.onclick = () => a.onClick(closeFn, mask);
    });
    mask.querySelector('[data-act="close"]').onclick = closeFn;
    return closeFn;
}

export function closeModal() {
    const old = document.getElementById('globalModalMask');
    if (old) old.remove();
}

// 详情键值对弹窗内容
export function kvTableHTML(pairs) {
    return `<table class="kv-table">${pairs.filter(p => p[1] !== undefined && p[1] !== null && p[1] !== '').map(([k, v]) => `<tr><td class="kv-k">${k}</td><td class="kv-v">${v}</td></tr>`).join('')}</table>`;
}

// ---------- 全局 UI 能力：CSV 导出（带 BOM，Excel 中文不乱码） ----------
export function exportCSV(filename, headers, rows) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`已导出 ${filename}（${rows.length} 条）`, 'success');
}

// ---------- 脱敏与时间工具 ----------
export function maskId(id) { return id && id.length > 10 ? id.slice(0, 6) + '****' + id.slice(-4) : id; }
export function maskPhone(ph) { return ph && ph.length === 11 ? ph.slice(0, 3) + '****' + ph.slice(7) : ph; }

function pad2(n) { return String(n).padStart(2, '0'); }
export function fmtDateTime(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// 简易相对时间
export function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}秒前`;
    if (s < 3600) return `${Math.floor(s / 60)}分钟前`;
    if (s < 86400) return `${Math.floor(s / 3600)}小时前`;
    return `${Math.floor(s / 86400)}天前`;
}

// 页面级事件动作注册表（html 内联 onclick="secAction('key', args)"，各模块在 init 里注册处理函数）
window.secActions = window.secActions || {};
window.secAction = function(key, ...args) {
    const fn = window.secActions[key];
    if (fn) return fn(...args);
    console.warn('未注册的动作:', key);
};

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
            
            // 加载对应的HTML文件（带版本号，避免命中旧缓存）
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `html/${navId}.html?v=${ASSET_VER}`, true);
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
        workorder: 'js/workorder.js',
        events: 'js/events.js',
        judge: 'js/judge.js',
        alarm: 'js/alarm.js',
        analysis: 'js/analysis.js',
        passage: 'js/passage.js',
        face: 'js/face.js',
        handoff: 'js/handoff.js',
        schedule: 'js/schedule.js',
        performance: 'js/performance.js',
        config: 'js/config.js'
    };
    
    const scriptSrc = scriptMap[navId];
    if (!scriptSrc) return;
    const scriptUrl = `${scriptSrc}?v=${ASSET_VER}`;
    
    // 检查是否已经加载过该脚本
    const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
    if (existingScript) {
        // 如果已经加载过，移除后重新加载
        existingScript.parentNode.removeChild(existingScript);
    }
    
    // 创建并加载脚本
    const script = document.createElement('script');
    script.type = 'module';
    script.src = scriptUrl;
    document.body.appendChild(script);
    
    script.onload = function() {
        console.log('脚本加载完成:', scriptSrc);
        // 等待一小段时间确保DOM已更新
        setTimeout(() => {
            // 调用模块的初始化函数
            const initFunc = window[`init${navId.charAt(0).toUpperCase() + navId.slice(1)}Module`];
            if (typeof initFunc === 'function') {
                initFunc();
            }
        }, 100);
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
            
            // 检查设备管理模块是否存在
            const deviceModuleExists = document.getElementById('device') !== null;
            
            if (typeof window.loadDeviceDetail === 'function' && deviceModuleExists) {
                // 如果函数已定义且设备管理模块存在，直接调用
                window.loadDeviceDetail(deviceType);
            } else {
                // 如果函数未定义或模块不存在，先加载设备管理模块
                loadDeviceModuleThenDetail(deviceType);
            }
        });
    });
}

// 先加载设备管理模块，然后调用设备详情
function loadDeviceModuleThenDetail(deviceType) {
    const contentDiv = document.querySelector('.content');
    if (!contentDiv) return;
    
    // 显示加载状态
    contentDiv.innerHTML = '<div class="loading">加载中...</div>';
    
    // 加载设备管理HTML
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `html/device.html?v=${ASSET_VER}`, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            contentDiv.innerHTML = xhr.responseText;
            
            // 加载设备管理JavaScript
            const script = document.createElement('script');
            script.type = 'module';
            script.src = `js/device.js?v=${ASSET_VER}`;
            document.body.appendChild(script);
            script.onload = () => {
                setTimeout(() => {
                    // 更新导航状态
                    const navItems = document.querySelectorAll('.nav-item');
                    navItems.forEach(nav => nav.classList.remove('active'));
                    const deviceNav = document.querySelector('.nav-item[data-nav="device"]');
                    if (deviceNav) deviceNav.classList.add('active');
                    
                    // 调用设备详情函数
                    if (typeof window.loadDeviceDetail === 'function') {
                        window.loadDeviceDetail(deviceType);
                    }
                }, 100);
            };
            script.onerror = function() {
                console.error('加载设备管理脚本失败');
            };
        }
    };
    xhr.send();
}

// 分页工具函数
export function createPagination(totalItems, itemsPerPage, currentPage, onPageChange) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (totalPages <= 1) return '';
    
    let paginationHTML = `
        <div class="pagination-page">
            <button class="btn btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="window.onPageChange(${currentPage - 1})">上一页</button>
            <span class="page-info">第 ${currentPage} 页，共 ${totalPages} 页</span>
            <button class="btn btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="window.onPageChange(${currentPage + 1})">下一页</button>
        </div>
    `;
    
    return paginationHTML;
}

// 分页数据处理
export function paginateData(data, page, itemsPerPage = 20) {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
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
    
    // 绘制条形
    data.forEach((value, index) => {
        const barHeight = ((value - minValue) / range) * (height - 2 * padding);
        const x = padding + index * barWidth;
        const y = height - padding - barHeight;
        
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
        
        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(x + 5, y, barWidth - 10, barHeight);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.fillText(value, x + barWidth / 2, y - 10);
        
        if (labels && labels[index]) {
            ctx.fillStyle = '#909399';
            ctx.font = '11px Microsoft YaHei';
            ctx.fillText(labels[index], x + barWidth / 2, height - padding + 20);
        }
    });
    
    // 重绘辅助
    const redraw = (highlightIndex = -1, selectedIndex = -1) => {
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#909399';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, 20);
        
        bars.forEach((bar, index) => {
            if (selectedIndex >= 0) {
                if (index === selectedIndex) {
                    ctx.fillStyle = '#409eff';
                    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(bar.x, bar.y, bar.width, bar.height);
                } else {
                    ctx.fillStyle = bar.color + '80';
                    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
                }
            } else if (index === highlightIndex) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(bar.x - 2, bar.y - 2, bar.width + 4, bar.height + 4);
                ctx.fillStyle = bar.color;
                ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
            } else {
                ctx.fillStyle = bar.color;
                ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
            }
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Microsoft YaHei';
            ctx.textAlign = 'center';
            ctx.fillText(bar.value, bar.x + bar.width / 2, bar.y - 10);
            
            if (labels && labels[bar.index]) {
                ctx.fillStyle = '#909399';
                ctx.font = '11px Microsoft YaHei';
                ctx.fillText(labels[bar.index], bar.x + bar.width / 2, height - padding + 20);
            }
        });
    };
    
    // 鼠标移动 - tooltip 与高亮
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        let found = -1;
        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i];
            if (mouseX >= bar.x && mouseX <= bar.x + bar.width &&
                mouseY >= bar.y && mouseY <= bar.y + bar.height) {
                found = i;
                break;
            }
        }
        
        if (found >= 0) {
            const bar = bars[found];
            redraw(found);
            tooltip.innerHTML = `
                <div><strong>${bar.label}</strong></div>
                <div>数值: ${bar.value}</div>
                <div>占比: ${((bar.value / maxValue) * 100).toFixed(1)}%</div>
            `;
            tooltip.style.left = (e.clientX + 10) + 'px';
            tooltip.style.top = (e.clientY + 10) + 'px';
            tooltip.style.display = 'block';
        } else {
            redraw();
            tooltip.style.display = 'none';
        }
    });
    
    canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        redraw();
    });
    
    // 点击 - 筛选反馈
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        for (const bar of bars) {
            if (mouseX >= bar.x && mouseX <= bar.x + bar.width &&
                mouseY >= bar.y && mouseY <= bar.y + bar.height) {
                redraw(-1, bar.index);
                toast(`已选中: ${bar.label}（${bar.value}）`, 'info');
                break;
            }
        }
    });
}

// 响应式处理
window.addEventListener('resize', () => {
    // 重新绘制所有图表（只有在dashboard页面时）
    const dashboardModule = document.getElementById('dashboard');
    if (dashboardModule && window.renderCharts) {
        window.renderCharts();
    }
});

// 移动端导航功能
export function setupMobileNavigation() {
    const mobileNavBtn = document.getElementById('mobileNavBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('overlay');
    
    if (!mobileNavBtn || !sidebar || !overlay) return;
    
    mobileNavBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    });
    
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    });
}

// 导航徽标（未处理告警 / 待判图）
export function refreshNavBadges() {
    const store = getStore();
    const sets = [
        { nav: 'alarm', count: store.alarms.filter(a => a.status === '未处理').length },
        { nav: 'judge', count: store.bags.filter(b => b.status === 'pending').length },
        { nav: 'handoff', count: store.handoffs.filter(h => h.status !== '已完成').length },
        { nav: 'workorder', count: store.workorders.filter(w => w.status !== '已完成').length }
    ];
    sets.forEach(s => {
        const el = document.querySelector(`.nav-item[data-nav="${s.nav}"] .nav-badge`);
        if (el) {
            el.textContent = s.count > 99 ? '99+' : s.count;
            el.style.display = s.count > 0 ? 'inline-block' : 'none';
        }
    });
}

// 页面加载完成后初始化（防止 utils.js 被模块二次求值时重复注册）
document.addEventListener('DOMContentLoaded', () => {
    if (window.__SEC_INIT_DONE__) return;
    window.__SEC_INIT_DONE__ = true;
    
    // 设置时间更新
    updateTime();
    setInterval(() => { updateTime(); refreshNavBadges(); }, 1000);
    
    // 设置导航功能
    setupNavigation();
    
    // 设置设备切换
    setupDeviceSwitch();
    
    // 初始化移动端导航
    setupMobileNavigation();
    
    // 初始数据加载（只加载首页数据）
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
    xhr.open('GET', `html/dashboard.html?v=${ASSET_VER}`, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                // 替换内容
                contentDiv.innerHTML = xhr.responseText;
                
                // 加载首页JavaScript
                const script = document.createElement('script');
                script.type = 'module';
                script.src = `js/dashboard.js?v=${ASSET_VER}`;
                document.body.appendChild(script);
                script.onload = () => {
                    console.log('Dashboard script loaded');
                    // 调用首页初始化函数
                    setTimeout(() => {
                        if (typeof window.initDashboardModule === 'function') {
                            window.initDashboardModule();
                        } else {
                            console.error('initDashboardModule函数未定义');
                        }
                    }, 100);
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
