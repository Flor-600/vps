// Initialize Lucide Icons
lucide.createIcons();

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
        const response = await fetch('/api/metrics');
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
        
    } catch (err) {
        console.error("Metrics fetch error:", err);
    }
}

setInterval(fetchMetrics, 2000);
fetchMetrics();


// Terminal Actions
const terminalOutput = document.getElementById('terminalOutput');
const terminalInput = document.getElementById('terminalInput');

function addTerminalLine(text, isError = false) {
    if(!terminalOutput) return;
    
    const line = document.createElement('div');
    line.className = 'term-line' + (isError ? ' error-msg' : '');
    
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
            addTerminalLine("Error: " + data.output, true);
        }
    } catch (err) {
        addTerminalLine("Sistem Hatası: Arka plan sunucusuna bağlanılamadı. Lütfen 'python server.py' çalıştığından emin olun.", true);
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
            addTerminalLine(`[HATA] ${data.output}`, true);
        }
    } catch (err) {
        addTerminalLine(`[HATA] Yükleme başarısız: Sunucu bağlantısı koptu.`, true);
    }
    
    setTimeout(() => {
        uploadProgress.style.display = 'none';
        uploadBar.style.width = '0%';
    }, 2000);
}

// --- FILE MANAGER LOGIC ---
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
            fileInfo.innerHTML = `
                <i data-lucide="file"></i>
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
            deleteBtn.onclick = () => deleteFile(file.name);
            
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
    const apiKey = document.getElementById('ytApiKey').value.trim();
    const btn = document.getElementById('ytDownloadBtn');
    const progress = document.getElementById('ytProgress');
    
    if (!url) {
        addTerminalLine('[HATA] Lütfen bir YouTube URL\'si girin!', false);
        return;
    }
    if (!apiKey) {
        addTerminalLine('[HATA] Lütfen API Key\'inizi girin!', false);
        return;
    }
    
    btn.disabled = true;
    progress.style.display = 'block';
    addTerminalLine(`[YT] İndirme başlatılıyor... Format: ${selectedFormat}`);
    
    try {
        const response = await fetch('/api/youtube', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, format: selectedFormat, apikey: apiKey })
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
