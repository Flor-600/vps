import http.server
import socketserver
import subprocess
import json
import os

PORT = 8080

class TermuxHandler(http.server.SimpleHTTPRequestHandler):
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
        print(f"Termux VPS Console is running on http://localhost:{PORT}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
