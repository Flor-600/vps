import http.server
import socketserver
import subprocess
import json
import os

PORT = 8080

class TermuxHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/metrics':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            metrics = {
                'cpu_usage': 0,
                'ram_total': 0,
                'ram_used': 0,
                'uptime': '0h 0m'
            }
            
            try:
                # Get Uptime
                if os.path.exists('/proc/uptime'):
                    with open('/proc/uptime', 'r') as f:
                        uptime_seconds = float(f.readline().split()[0])
                        hours = int(uptime_seconds // 3600)
                        minutes = int((uptime_seconds % 3600) // 60)
                        metrics['uptime'] = f"{hours}h {minutes}m"
                
                # Get CPU Load (1 min average)
                if os.path.exists('/proc/loadavg'):
                    with open('/proc/loadavg', 'r') as f:
                        load = float(f.readline().split()[0])
                        # Rough conversion of load to percentage (assuming 8 cores roughly)
                        metrics['cpu_usage'] = min(int((load / 8.0) * 100), 100)
                
                # Get RAM
                if os.path.exists('/proc/meminfo'):
                    mem_total = 0
                    mem_available = 0
                    with open('/proc/meminfo', 'r') as f:
                        for line in f:
                            if line.startswith('MemTotal:'):
                                mem_total = int(line.split()[1])
                            elif line.startswith('MemAvailable:') or line.startswith('MemFree:'):
                                mem_available = int(line.split()[1])
                    
                    if mem_total > 0:
                        metrics['ram_total'] = round(mem_total / 1024 / 1024, 1) # GB
                        metrics['ram_used'] = round((mem_total - mem_available) / 1024 / 1024, 1) # GB
            except Exception as e:
                pass
                
            self.wfile.write(json.dumps(metrics).encode('utf-8'))
            return
            
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/command':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                command = data.get('command', '')
                
                # Execute command
                # Use shell=True to allow complex bash commands (pipes, etc)
                process = subprocess.Popen(
                    command,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True
                )
                output, _ = process.communicate()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                response = {
                    'status': 'success',
                    'output': output
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'error', 'output': str(e)}
                self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    # Ensure working directory is the same as the script
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), TermuxHandler) as httpd:
        print(f"Termux VPS Console is running on Phone WebPanel : http://localhost:{PORT}")
        print(f"Termux VPS Console is running on Computer WebPanel : http://192.168.1.157:{PORT}/")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
