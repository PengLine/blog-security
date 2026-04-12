import { generateMockData } from './utils.js';

// 渲染判图列表
function renderJudgeItems(judgeItems) {
    const judgeList = document.getElementById('judgeList');
    if (!judgeList) return;
    
    judgeList.innerHTML = '';

    // 生成模拟图像URL
    const generateImageUrl = (imageId) => {
        // 使用不同的背景颜色和图案模拟不同的包裹图像
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const pattern = Math.random() > 0.5 ? 'dots' : 'stripes';
        return `https://via.placeholder.com/600x400/${color.substring(1)}/ffffff?text=包裹图像+${imageId}`;
    };

    judgeItems.forEach(item => {
        const judgeItem = document.createElement('div');
        judgeItem.className = 'judge-item';
        judgeItem.dataset.id = item.id;
        
        // 添加更多图像信息
        item.imageUrl = generateImageUrl(item.imageId);
        item.contrabandType = Math.random() > 0.7 ? ['刀具', '液体', '易燃易爆'][Math.floor(Math.random() * 3)] : '';
        item.confidence = Math.random() > 0.7 ? (Math.random() * 30 + 70).toFixed(1) : '';
        
        judgeItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong>${item.device}</strong>
                <span class="status-tag ${item.status === '待处理' ? 'status-warning' : item.status === '处理中' ? 'status-processing' : 'status-normal'}">${item.status}</span>
            </div>
            <div style="font-size: 12px; color: #909399; margin: 5px 0;">${item.time}</div>
            <div style="font-size: 12px; display: flex; gap: 10px; flex-wrap: wrap;">
                ${item.contrabandType ? `<span>可疑类型: ${item.contrabandType}</span>` : ''}
                ${item.confidence ? `<span>置信度: ${item.confidence}%</span>` : ''}
            </div>
            <div style="font-size: 11px; color: #909399; margin-top: 5px;">图像ID: ${item.imageId}</div>
        `;
        
        // 添加点击事件
        judgeItem.addEventListener('click', () => {
            document.querySelectorAll('.judge-item').forEach(i => i.classList.remove('active'));
            judgeItem.classList.add('active');
            
            // 加载图像
            loadJudgeImage(item);
        });
        
        judgeList.appendChild(judgeItem);
    });
}

// 加载判图图像
function loadJudgeImage(item) {
    const imageContainer = document.querySelector('.image-container');
    if (!imageContainer || !item) return;

    // 清空容器
    imageContainer.innerHTML = '';
    
    // 创建图像元素
    const img = document.createElement('img');
    img.src = item.imageUrl;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    img.style.transition = 'transform 0.3s ease';
    
    // 图像加载状态
    img.onload = () => {
        img.style.opacity = '1';
    };
    img.style.opacity = '0';
    
    // 创建图像操作容器
    const imageWrapper = document.createElement('div');
    imageWrapper.style.position = 'relative';
    imageWrapper.style.width = '100%';
    imageWrapper.style.height = '100%';
    imageWrapper.style.display = 'flex';
    imageWrapper.style.alignItems = 'center';
    imageWrapper.style.justifyContent = 'center';
    
    // 创建缩放和旋转控制
    const controls = document.createElement('div');
    controls.style.cssText = `
        position: absolute;
        bottom: 10px;
        right: 10px;
        display: flex;
        gap: 5px;
        z-index: 10;
    `;
    
    // 缩放按钮
    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'btn btn-secondary';
    zoomInBtn.innerHTML = '放大';
    zoomInBtn.style.fontSize = '10px';
    zoomInBtn.onclick = () => {
        const currentScale = parseFloat(img.style.transform.replace('scale(', '').replace(')', '')) || 1;
        img.style.transform = `scale(${currentScale + 0.2})`;
    };
    
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'btn btn-secondary';
    zoomOutBtn.innerHTML = '缩小';
    zoomOutBtn.style.fontSize = '10px';
    zoomOutBtn.onclick = () => {
        const currentScale = parseFloat(img.style.transform.replace('scale(', '').replace(')', '')) || 1;
        img.style.transform = `scale(${Math.max(0.2, currentScale - 0.2)})`;
    };
    
    // 旋转按钮
    const rotateBtn = document.createElement('button');
    rotateBtn.className = 'btn btn-secondary';
    rotateBtn.innerHTML = '旋转';
    rotateBtn.style.fontSize = '10px';
    rotateBtn.onclick = () => {
        const currentRotation = parseFloat(img.dataset.rotation || '0');
        img.dataset.rotation = (currentRotation + 90).toString();
        img.style.transform = `rotate(${img.dataset.rotation}deg)`;
    };
    
    // 重置按钮
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-secondary';
    resetBtn.innerHTML = '重置';
    resetBtn.style.fontSize = '10px';
    resetBtn.onclick = () => {
        img.style.transform = '';
        img.dataset.rotation = '0';
    };
    
    controls.appendChild(zoomInBtn);
    controls.appendChild(zoomOutBtn);
    controls.appendChild(rotateBtn);
    controls.appendChild(resetBtn);
    
    // 添加图像信息
    const imageInfo = document.createElement('div');
    imageInfo.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        background-color: rgba(0, 0, 0, 0.5);
        color: #ffffff;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 10;
    `;
    imageInfo.innerHTML = `
        <div>设备: ${item.device}</div>
        <div>时间: ${item.time}</div>
        ${item.contrabandType ? `<div style="color: #f56c6c;">可疑类型: ${item.contrabandType}</div>` : ''}
        ${item.confidence ? `<div>置信度: ${item.confidence}%</div>` : ''}
    `;
    
    imageWrapper.appendChild(img);
    imageWrapper.appendChild(controls);
    imageWrapper.appendChild(imageInfo);
    imageContainer.appendChild(imageWrapper);
    
    // 保存当前选中的图像信息
    window.currentJudgeItem = item;
    
    // 绑定判图按钮事件
    bindJudgeButtons();
}

// 绑定判图按钮事件
function bindJudgeButtons() {
    const judgeControls = document.querySelector('.judge-controls');
    if (!judgeControls) return;
    
    // 正常按钮
    const normalBtn = judgeControls.querySelector('.btn-primary');
    if (normalBtn) {
        normalBtn.onclick = () => {
            judgeImage('正常');
        };
    }
    
    // 可疑按钮
    const suspiciousBtn = judgeControls.querySelector('.btn-warning');
    if (suspiciousBtn) {
        suspiciousBtn.onclick = () => {
            judgeImage('可疑');
        };
    }
    
    // 违禁品按钮
    const contrabandBtn = judgeControls.querySelector('.btn-danger');
    if (contrabandBtn) {
        contrabandBtn.onclick = () => {
            judgeImage('违禁品');
        };
    }
    
    // 下一图像按钮
    const nextBtn = judgeControls.querySelector('.btn-secondary');
    if (nextBtn) {
        nextBtn.onclick = () => {
            loadNextJudgeImage();
        };
    }
}

// 判图处理
function judgeImage(result) {
    if (!window.currentJudgeItem) return;
    
    const item = window.currentJudgeItem;
    
    // 模拟判图处理
    console.log('判图结果:', result, '图像ID:', item.imageId);
    
    // 更新当前图像的状态
    const activeItem = document.querySelector('.judge-item.active');
    if (activeItem) {
        // 更新状态标签
        const statusTag = activeItem.querySelector('.status-tag');
        if (statusTag) {
            statusTag.className = 'status-tag status-normal';
            statusTag.textContent = '已完成';
        }
        
        // 添加判图结果
        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = `
            font-size: 11px;
            margin-top: 5px;
            padding: 2px 6px;
            border-radius: 4px;
            background-color: ${result === '正常' ? '#67c23a' : result === '可疑' ? '#e6a23c' : '#f56c6c'};
            color: white;
            display: inline-block;
        `;
        resultDiv.textContent = `判图结果: ${result}`;
        activeItem.appendChild(resultDiv);
        
        // 移除活跃状态
        activeItem.classList.remove('active');
    }
    
    // 显示成功提示
    alert(`判图完成: ${result}`);
    
    // 加载下一图像
    loadNextJudgeImage();
}

// 加载下一图像
function loadNextJudgeImage() {
    const judgeItems = document.querySelectorAll('.judge-item');
    const activeItem = document.querySelector('.judge-item.active');
    
    let nextItem = null;
    
    if (activeItem) {
        // 寻找当前活跃项的下一个待处理项
        let foundCurrent = false;
        for (const item of judgeItems) {
            if (foundCurrent && item.querySelector('.status-tag').textContent === '待处理') {
                nextItem = item;
                break;
            }
            if (item === activeItem) {
                foundCurrent = true;
            }
        }
    } else {
        // 如果没有活跃项，寻找第一个待处理项
        for (const item of judgeItems) {
            if (item.querySelector('.status-tag').textContent === '待处理') {
                nextItem = item;
                break;
            }
        }
    }
    
    if (nextItem) {
        // 模拟点击下一个项
        nextItem.click();
    } else {
        // 没有更多待处理项
        const imageContainer = document.querySelector('.image-container');
        if (imageContainer) {
            imageContainer.innerHTML = '<div style="color: #909399; font-size: 16px;">没有更多待处理图像</div>';
        }
        window.currentJudgeItem = null;
    }
}

// 批量处理功能
function setupBatchProcess() {
    const batchBtn = document.querySelector('.filter-bar button.btn-secondary');
    if (batchBtn && batchBtn.textContent === '批量处理') {
        batchBtn.onclick = () => {
            const judgeItems = document.querySelectorAll('.judge-item');
            const pendingItems = Array.from(judgeItems).filter(item => 
                item.querySelector('.status-tag').textContent === '待处理'
            );
            
            if (pendingItems.length === 0) {
                alert('没有待处理的图像');
                return;
            }
            
            if (confirm(`确认批量处理 ${pendingItems.length} 个待处理图像？`)) {
                pendingItems.forEach((item, index) => {
                    // 模拟批量处理延迟
                    setTimeout(() => {
                        // 随机选择判图结果
                        const results = ['正常', '可疑', '违禁品'];
                        const result = results[Math.floor(Math.random() * results.length)];
                        
                        // 更新状态标签
                        const statusTag = item.querySelector('.status-tag');
                        if (statusTag) {
                            statusTag.className = 'status-tag status-normal';
                            statusTag.textContent = '已完成';
                        }
                        
                        // 添加判图结果
                        const resultDiv = document.createElement('div');
                        resultDiv.style.cssText = `
                            font-size: 11px;
                            margin-top: 5px;
                            padding: 2px 6px;
                            border-radius: 4px;
                            background-color: ${result === '正常' ? '#67c23a' : result === '可疑' ? '#e6a23c' : '#f56c6c'};
                            color: white;
                            display: inline-block;
                        `;
                        resultDiv.textContent = `判图结果: ${result}`;
                        item.appendChild(resultDiv);
                        
                        // 如果是最后一个，显示完成提示
                        if (index === pendingItems.length - 1) {
                            alert('批量处理完成！');
                            
                            // 清空当前图像
                            const imageContainer = document.querySelector('.image-container');
                            if (imageContainer) {
                                imageContainer.innerHTML = '<div style="color: #909399; font-size: 16px;">批量处理完成，没有更多待处理图像</div>';
                            }
                            window.currentJudgeItem = null;
                        }
                    }, index * 200);
                });
            }
        };
    }
}

// 初始化批量处理功能
function initJudgeModule() {
    setupBatchProcess();
}

// 加载判图模块数据
function loadJudgeData() {
    const data = generateMockData();
    renderJudgeItems(data.judgeItems);
    initJudgeModule();
}

// 当判图模块显示时加载数据
const judgeModule = document.getElementById('judge');
if (judgeModule) {
    // 初始加载
    loadJudgeData();
    
    // 监听模块显示事件（如果需要）
    judgeModule.addEventListener('DOMNodeInsertedIntoDocument', loadJudgeData);
}