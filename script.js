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
