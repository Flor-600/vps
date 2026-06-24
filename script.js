// Initialize Lucide Icons
lucide.createIcons();

// Tab Switching Logic
function switchTab(tabId) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active');
    });

    // Show selected tab content
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    // Add active class to clicked button
    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => 
        btn.getAttribute('onclick').includes(tabId)
    );
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Perform specific actions when tabs change
    if (tabId === 'tab-pip') {
        refreshPipList();
    }
}

// Time Widget
function updateTime() {
    const timeWidget = document.getElementById('timeWidget');
    if(!timeWidget) return;
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('tr-TR', { hour12: false });
    timeWidget.textContent = timeString;
}

setInterval(updateTime, 1000);
updateTime();

// Real Metrics Polling
async function fetchMetrics() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        // Update CPU
        document.getElementById('cpuValue').textContent = data.cpu_usage;
        const cpuBar = document.getElementById('cpuBar');
        cpuBar.style.width = data.cpu_usage + '%';
        if (data.cpu_usage > 80) cpuBar.className = 'progress warning';
        else cpuBar.className = 'progress';
        
        // Update RAM
        document.getElementById('ramValue').textContent = data.ram_used;
        const ramBar = document.getElementById('ramBar');
        const ramPercent = data.ram_total > 0 ? (data.ram_used / data.ram_total) * 100 : 0;
        ramBar.style.width = ramPercent + '%';
        if (ramPercent > 80) ramBar.className = 'progress warning';
        else ramBar.className = 'progress';
        
        // Update Uptime
        document.getElementById('uptimeValue').textContent = data.uptime;

        // Update Battery
        const batEl = document.getElementById('batteryValue');
        if (batEl) {
            batEl.textContent = `${data.battery_level}% (${data.battery_status})`;
            if (data.battery_level < 20 && data.battery_status !== 'Charging') {
                batEl.className = 'info-value mono text-danger';
                // Trigger Macro Warning if checked
                const macroBat = document.getElementById('macroLowBattery');
                if (macroBat && macroBat.checked && !window.batteryWarned) {
                    addTerminalLine(`[KRİTİK BİLDİRİM] Düşük pil seviyesi: %${data.battery_level}!`, true);
                    window.batteryWarned = true;
                }
            } else {
                batEl.className = 'info-value mono';
                if (data.battery_level >= 20) window.batteryWarned = false;
            }
        }

        // Update Temperature
        const tempEl = document.getElementById('tempValue');
        if (tempEl) {
            tempEl.textContent = `${data.temperature.toFixed(1)} °C`;
            if (data.temperature > 45) {
                tempEl.className = 'info-value mono text-danger';
                const macroTemp = document.getElementById('macroHighTemp');
                if (macroTemp && macroTemp.checked && !window.tempWarned) {
                    addTerminalLine(`[KRİTİK BİLDİRİM] Telefon sıcaklığı çok yüksek: ${data.temperature}°C!`, true);
                    window.tempWarned = true;
                }
            } else if (data.temperature > 39) {
                tempEl.className = 'info-value mono text-warning';
                window.tempWarned = false;
            } else {
                tempEl.className = 'info-value mono text-accent';
                window.tempWarned = false;
            }
        }

        // Update Storage (Disk)
        const storageEl = document.getElementById('storageValue');
        const storageBar = document.getElementById('storageBar');
        if (storageEl && storageBar) {
            storageEl.textContent = `${data.storage_used} / ${data.storage_total}`;
            storageBar.style.width = `${data.storage_percent}%`;
            if (data.storage_percent > 85) storageBar.className = 'progress danger';
            else if (data.storage_percent > 70) storageBar.className = 'progress warning';
            else storageBar.className = 'progress';
        }
        
    } catch (err) {
        console.error("Metrics fetch error:", err);
    }
}

// Stats poll interval
setInterval(fetchMetrics, 3000);
fetchMetrics();


// Terminal Actions
const terminalOutput = document.getElementById('terminalOutput');
const terminalInput = document.getElementById('terminalInput');

function addTerminalLine(text, isSuccess = false) {
    if(!terminalOutput) return;
    
    const line = document.createElement('div');
    line.className = 'term-line' + (isSuccess ? ' success-msg' : '');
    
    line.textContent = text;
    
    terminalOutput.appendChild(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function addCommandEcho(cmd) {
    if(!terminalOutput) return;
    
    const line = document.createElement('div');
    line.className = 'term-line';
    
    const prompt = document.createElement('span');
    prompt.className = 'prompt';
    prompt.textContent = 'root@termux:~#';
    line.appendChild(prompt);
    
    const content = document.createTextNode(' ' + cmd);
    line.appendChild(content);
    
    terminalOutput.appendChild(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// Fetch API integration with server.py
async function executeCommand(cmd) {
    if (!cmd.trim()) return;
    
    addCommandEcho(cmd);
    
    try {
        const response = await fetch('/api/command', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command: cmd })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            if (data.output.trim() !== '') {
                addTerminalLine(data.output);
            }
        } else {
            addTerminalLine("Error: " + data.output, false);
        }
    } catch (err) {
        addTerminalLine("Sistem Hatası: Arka plan sunucusuna bağlanılamadı. Lütfen 'python server.py' çalıştığından emin olun.", false);
        console.error(err);
    }
}

// Map quick action buttons to actual termux/bash commands
const quickCommands = {
    'start_bot': 'python3 main.py',
    'restart_server': 'echo "Yeniden başlatılıyor..." && sleep 2 && echo "Servisler aktif."',
    'clear_logs': 'echo "Loglar temizlendi."',
    'update_pkg': 'pkg update -y'
};

function triggerAction(actionKey) {
    const cmd = quickCommands[actionKey] || 'echo "Unknown command"';
    executeCommand(cmd);
}

// Listen for Enter key on terminal input
if (terminalInput) {
    terminalInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const cmd = this.value;
            this.value = '';
            executeCommand(cmd);
        }
    });
}

// --- FLASHLIGHT & BRIGHTNESS CONTROLS ---
let flashlightOn = false;
async function toggleFlashlight() {
    flashlightOn = !flashlightOn;
    const btnText = document.getElementById('flashlightStatus');
    const icon = document.getElementById('flashlightIcon');
    
    btnText.textContent = flashlightOn ? 'Flaş Açık 🔦' : 'Flaş Kapalı';
    if(icon) {
        icon.style.color = flashlightOn ? 'var(--warning)' : 'var(--text-secondary)';
    }
    
    try {
        await fetch('/api/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'flashlight', value: flashlightOn })
        });
    } catch(e) {
        console.error("Flashlight toggle error:", e);
    }
}

async function changeBrightness(val) {
    document.getElementById('brightnessVal').textContent = val;
    try {
        await fetch('/api/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'brightness', value: parseInt(val) })
        });
    } catch(e) {
        console.error("Brightness error:", e);
    }
}

// --- FILE UPLOAD LOGIC ---
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const uploadBar = document.getElementById('uploadBar');

if (uploadZone && fileInput) {
    // Click to open file dialog
    uploadZone.addEventListener('click', () => fileInput.click());

    // Drag and Drop Events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.remove('dragover');
        }, false);
    });

    uploadZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) handleUpload(files[0]);
    }, false);

    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) handleUpload(this.files[0]);
    });
}

async function handleUpload(file) {
    if (!file) return;
    
    uploadProgress.style.display = 'block';
    uploadBar.style.width = '0%';
    addTerminalLine(`[UPLOAD] '${file.name}' (${(file.size / 1024 / 1024).toFixed(2)} MB) yükleniyor...`);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'X-File-Name': encodeURIComponent(file.name)
            },
            body: file
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            uploadBar.style.width = '100%';
            addTerminalLine(`[OK] ${data.output}`, true);
            refreshFileList(); // Refresh the file list after upload
        } else {
            uploadBar.style.width = '0%';
            addTerminalLine(`[HATA] ${data.output}`, false);
        }
    } catch (err) {
        addTerminalLine(`[HATA] Yükleme başarısız: Sunucu bağlantısı koptu.`, false);
    }
    
    setTimeout(() => {
        uploadProgress.style.display = 'none';
        uploadBar.style.width = '0%';
    }, 2000);
}

// --- FILE MANAGER LOGIC & PREVIEW ---
const fileListElement = document.getElementById('fileList');

async function refreshFileList() {
    if (!fileListElement) return;
    
    try {
        const response = await fetch('/api/files');
        const data = await response.json();
        
        fileListElement.innerHTML = '';
        
        if (!data.files || data.files.length === 0) {
            fileListElement.innerHTML = '<div class="file-item empty-state">Dosya bulunamadı...</div>';
            return;
        }
        
        data.files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            
            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';
            fileInfo.style.cursor = 'pointer';
            fileInfo.onclick = () => previewFile(file.name);
            fileInfo.innerHTML = `
                <i data-lucide="file-text"></i>
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <span class="file-name" title="${file.name}">${file.name}</span>
                    <span class="file-size">${file.size}</span>
                </div>
            `;
            
            const actions = document.createElement('div');
            actions.className = 'file-actions';
            
            const downloadBtn = document.createElement('a');
            downloadBtn.className = 'file-download';
            downloadBtn.href = file.url;
            downloadBtn.download = file.name;
            downloadBtn.innerHTML = '<i data-lucide="download"></i>';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'file-delete';
            deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            deleteBtn.title = 'Sil';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteFile(file.name);
            };
            
            actions.appendChild(downloadBtn);
            actions.appendChild(deleteBtn);
            item.appendChild(fileInfo);
            item.appendChild(actions);
            fileListElement.appendChild(item);
        });
        
        lucide.createIcons();
    } catch (err) {
        console.error("File list refresh error:", err);
        fileListElement.innerHTML = '<div class="file-item empty-state" style="color:var(--danger)">Bağlantı hatası</div>';
    }
}

// Initial fetch of files
refreshFileList();

// --- PREVIEW FILE IN MODAL ---
async function previewFile(fileName) {
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const body = document.getElementById('previewBody');
    
    title.textContent = `Önizleme: ${fileName}`;
    body.innerHTML = '<div class="empty-state">Yükleniyor...</div>';
    modal.classList.add('active');
    
    try {
        const response = await fetch(`/api/preview?name=${encodeURIComponent(fileName)}`);
        const data = await response.json();
        
        if (data.status === 'error') {
            body.innerHTML = `<div class="term-line error-msg">${data.output}</div>`;
            return;
        }
        
        if (data.type === 'text') {
            body.innerHTML = `<pre class="text-preview">${escapeHtml(data.content)}</pre>`;
        } else if (data.type === 'image') {
            body.innerHTML = `<img class="img-preview" src="${data.url}" alt="${fileName}">`;
        } else if (data.type === 'audio') {
            body.innerHTML = `
                <div style="text-align:center;">
                    <i data-lucide="music-4" style="width:48px; height:48px; color:var(--accent); margin-bottom:10px;"></i>
                    <audio class="audio-preview" controls src="${data.url}"></audio>
                </div>
            `;
            lucide.createIcons();
        } else {
            body.innerHTML = `<div class="empty-state">${data.content}</div>`;
        }
    } catch(err) {
        body.innerHTML = `<div class="term-line error-msg">Önizleme yüklenemedi.</div>`;
    }
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('active');
    // Stop any playing audio
    const audio = document.querySelector('.audio-preview');
    if (audio) audio.pause();
}

function escapeHtml(text) {
    return text
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// --- DELETE FILE ---
async function deleteFile(fileName) {
    if (!confirm(`'${fileName}' dosyasını silmek istediğinizden emin misiniz?`)) return;
    
    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: fileName })
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            addTerminalLine(`[SİLİNDİ] ${data.output}`, true);
            refreshFileList();
        } else {
            addTerminalLine(`[HATA] ${data.output}`, false);
        }
    } catch(err) {
        addTerminalLine(`[HATA] Silme başarısız.`, false);
    }
}

// --- PIP PACKAGES LOGIC ---
const pipListEl = document.getElementById('pipPackageList');

async function refreshPipList() {
    if (!pipListEl) return;
    pipListEl.innerHTML = '<div class="file-item empty-state">Python paketleri yükleniyor...</div>';
    
    try {
        const response = await fetch('/api/pip/list');
        const data = await response.json();
        
        if (data.status === 'error') {
            pipListEl.innerHTML = `<div class="file-item empty-state text-danger">Hata: ${data.output}</div>`;
            return;
        }
        
        pipListEl.innerHTML = '';
        if (data.packages.length === 0) {
            pipListEl.innerHTML = '<div class="file-item empty-state">Kurulu paket bulunamadı.</div>';
            return;
        }
        
        data.packages.forEach(pkg => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                <div class="file-info">
                    <i data-lucide="package-check" style="color:var(--success)"></i>
                    <div style="display:flex; flex-direction:column;">
                        <span class="file-name" style="font-weight:600;">${pkg.name}</span>
                        <span class="file-size" style="font-size:0.75rem;">Sürüm: ${pkg.version}</span>
                    </div>
                </div>
                <button class="file-delete" onclick="managePip('uninstall', '${pkg.name}')" title="Kaldır"><i data-lucide="trash-2"></i></button>
            `;
            pipListEl.appendChild(item);
        });
        lucide.createIcons();
    } catch(e) {
        pipListEl.innerHTML = '<div class="file-item empty-state text-danger">Sunucu bağlantı hatası.</div>';
    }
}

async function managePip(action, packageName = '') {
    const input = document.getElementById('pipPackageInput');
    const pkg = packageName || input.value.trim();
    
    if (!pkg) {
        alert("Lütfen paket adı girin!");
        return;
    }
    
    if (action === 'uninstall' && !confirm(`'${pkg}' paketini kaldırmak istediğinizden emin misiniz?`)) return;
    
    addTerminalLine(`[PIP] Paket ${action === 'install' ? 'kuruluyor' : 'kaldırılıyor'}: ${pkg}...`);
    if (input && !packageName) input.value = '';
    
    try {
        const response = await fetch('/api/pip/manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, package: pkg })
        });
        const data = await response.json();
        if (data.status === 'success') {
            addTerminalLine(`[PIP BAŞARILI] \n${data.output}`, true);
            refreshPipList();
        } else {
            addTerminalLine(`[PIP HATA] ${data.output}`, false);
        }
    } catch(e) {
        addTerminalLine(`[PIP HATA] Sunucuyla iletişim kurulamadı.`, false);
    }
}

// --- BACKUP LOGIC ---
async function createBackup() {
    const status = document.getElementById('backupStatus');
    status.textContent = 'Yedek arşivi hazırlanıyor, lütfen bekleyin...';
    
    try {
        const response = await fetch('/api/backup', { method: 'POST' });
        const data = await response.json();
        
        if (data.status === 'success') {
            status.textContent = data.output;
            addTerminalLine(`[YEDEK OK] Yedekleme paketi oluşturuldu: ${data.file}`, true);
            refreshFileList(); // Refresh to show backup zip file
        } else {
            status.textContent = `Hata: ${data.output}`;
            addTerminalLine(`[YEDEK HATA] ${data.output}`, false);
        }
    } catch(e) {
        status.textContent = 'Bağlantı hatası!';
    }
}

// --- YOUTUBE DOWNLOADER ---
let selectedFormat = '360';

document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        selectedFormat = this.dataset.fmt;
    });
});

async function downloadYoutube() {
    const url = document.getElementById('ytUrl').value.trim();
    const btn = document.getElementById('ytDownloadBtn');
    const progress = document.getElementById('ytProgress');
    
    if (!url) {
        addTerminalLine('[HATA] Lütfen bir YouTube URL\'si girin!', false);
        return;
    }
    
    btn.disabled = true;
    progress.style.display = 'block';
    addTerminalLine(`[YT] İndirme başlatılıyor... Format: ${selectedFormat}`);
    
    try {
        const response = await fetch('/api/youtube', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, format: selectedFormat })
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            addTerminalLine(`[OK] ${data.output}`, true);
            document.getElementById('ytUrl').value = '';
            refreshFileList();
        } else {
            addTerminalLine(`[HATA] ${data.output}`, false);
        }
    } catch(err) {
        addTerminalLine('[HATA] Sunucu bağlantısı koptu.', false);
    } finally {
        btn.disabled = false;
        progress.style.display = 'none';
    }
}

