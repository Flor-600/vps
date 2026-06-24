import http.server
import socketserver
import subprocess
import json
import os
import urllib.request
import urllib.parse

PORT = 8080

class TermuxHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/metrics' or self.path == '/api/stats':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            metrics = {
                'cpu_usage': 0,
                'ram_total': 0,
                'ram_used': 0,
                'uptime': '0h 0m',
                'battery_level': 100,
                'battery_status': 'Discharging',
                'temperature': 35.0,
                'storage_total': '0 GB',
                'storage_used': '0 GB',
                'storage_free': '0 GB',
                'storage_percent': 0
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

                # Get Storage (Disk) Info
                try:
                    import shutil
                    total, used, free = shutil.disk_usage(os.getcwd())
                    metrics['storage_total'] = f"{total / (2**30):.1f} GB"
                    metrics['storage_used'] = f"{used / (2**30):.1f} GB"
                    metrics['storage_free'] = f"{free / (2**30):.1f} GB"
                    metrics['storage_percent'] = int((used / total) * 100)
                except:
                    pass

                # Get Battery Status (Termux API fallback to system files)
                battery_set = False
                try:
                    # Try using command line termux-battery-status if available
                    proc = subprocess.Popen(['termux-battery-status'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    out, _ = proc.communicate(timeout=2)
                    if proc.returncode == 0:
                        bat_data = json.loads(out)
                        metrics['battery_level'] = bat_data.get('percentage', 100)
                        metrics['battery_status'] = bat_data.get('status', 'Discharging')
                        metrics['temperature'] = bat_data.get('temperature', 35.0)
                        battery_set = True
                except:
                    pass

                if not battery_set:
                    # Fallback to sys files (e.g. android battery sys paths)
                    try:
                        # Common paths for battery capacity & temp
                        cap_path = '/sys/class/power_supply/battery/capacity'
                        temp_path = '/sys/class/power_supply/battery/temp'
                        status_path = '/sys/class/power_supply/battery/status'
                        
                        if os.path.exists(cap_path):
                            with open(cap_path, 'r') as f:
                                metrics['battery_level'] = int(f.read().strip())
                        if os.path.exists(temp_path):
                            with open(temp_path, 'r') as f:
                                # Temp is often in tenths of degree (e.g. 350 for 35.0 C)
                                raw_temp = float(f.read().strip())
                                metrics['temperature'] = raw_temp / 10.0 if raw_temp > 100 else raw_temp
                        if os.path.exists(status_path):
                            with open(status_path, 'r') as f:
                                metrics['battery_status'] = f.read().strip()
                    except:
                        pass
            except Exception as e:
                pass
                
            self.wfile.write(json.dumps(metrics).encode('utf-8'))
            return
            
        elif self.path == '/api/files':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            upload_dir = os.path.join(os.getcwd(), 'uploads')
            files_list = []
            
            if os.path.exists(upload_dir):
                for f in os.listdir(upload_dir):
                    file_path = os.path.join(upload_dir, f)
                    if os.path.isfile(file_path):
                        size = os.path.getsize(file_path)
                        if size < 1024:
                            size_str = f"{size} B"
                        elif size < 1024 * 1024:
                            size_str = f"{size/1024:.1f} KB"
                        else:
                            size_str = f"{size/1024/1024:.2f} MB"
                            
                        files_list.append({
                            'name': f,
                            'size': size_str,
                            'url': f"/uploads/{f}"
                        })
                        
            self.wfile.write(json.dumps({'files': files_list}).encode('utf-8'))
            return

        elif self.path.startswith('/api/preview'):
            # Parse query params
            parsed_url = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed_url.query)
            file_name = params.get('name', [''])[0]
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            try:
                if not file_name or '..' in file_name or '/' in file_name or '\\' in file_name:
                    raise Exception('Geçersiz dosya adı!')
                
                upload_dir = os.path.join(os.getcwd(), 'uploads')
                file_path = os.path.join(upload_dir, file_name)
                
                if not os.path.exists(file_path):
                    raise Exception('Dosya bulunamadı!')
                
                # Check extension to decide response format
                ext = file_name.split('.')[-1].lower()
                text_exts = ['txt', 'log', 'py', 'js', 'html', 'css', 'json', 'sh', 'md', 'xml']
                img_exts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
                audio_exts = ['mp3', 'wav', 'ogg', 'm4a']
                
                if ext in text_exts:
                    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read(50000) # Max 50KB for safety
                        response = {'type': 'text', 'content': content}
                elif ext in img_exts:
                    response = {'type': 'image', 'url': f'/uploads/{file_name}'}
                elif ext in audio_exts:
                    response = {'type': 'audio', 'url': f'/uploads/{file_name}'}
                else:
                    response = {'type': 'binary', 'content': 'Önizleme desteklenmiyor. Lütfen dosyayı indirin.'}
            except Exception as e:
                response = {'status': 'error', 'output': str(e)}
                
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return

        elif self.path == '/api/pip/list':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            try:
                proc = subprocess.Popen(['pip', 'list', '--format=json'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                out, _ = proc.communicate(timeout=10)
                if proc.returncode == 0:
                    packages = json.loads(out)
                else:
                    # Fallback to standard pip list parser if --format=json fails
                    proc2 = subprocess.Popen(['pip', 'list'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    out2, _ = proc2.communicate(timeout=10)
                    packages = []
                    lines = out2.split('\n')[2:] # skip headers
                    for line in lines:
                        parts = line.split()
                        if len(parts) >= 2:
                            packages.append({'name': parts[0], 'version': parts[1]})
                response = {'status': 'success', 'packages': packages}
            except Exception as e:
                response = {'status': 'error', 'output': str(e)}
                
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return
            
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/upload':
            # Get filename from headers
            file_name = self.headers.get('X-File-Name', 'uploaded_file')
            
            # Ensure uploads directory exists
            upload_dir = os.path.join(os.getcwd(), 'uploads')
            if not os.path.exists(upload_dir):
                os.makedirs(upload_dir)
                
            file_path = os.path.join(upload_dir, file_name)
            
            try:
                content_length = int(self.headers['Content-Length'])
                # Read the binary data and save directly
                with open(file_path, 'wb') as f:
                    chunk_size = 8192
                    bytes_read = 0
                    while bytes_read < content_length:
                        chunk = self.rfile.read(min(chunk_size, content_length - bytes_read))
                        if not chunk:
                            break
                        f.write(chunk)
                        bytes_read += len(chunk)
                        
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'success', 'output': f"'{file_name}' başarıyla yüklendi!"}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'error', 'output': str(e)}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
        elif self.path == '/api/command':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                command = data.get('command', '')
                
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

        elif self.path == '/api/control':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                action = data.get('action', '')
                val = data.get('value', '')
                
                output = "Başarılı"
                
                if action == 'flashlight':
                    status = 'on' if val else 'off'
                    try:
                        subprocess.run(['termux-torch', status], check=True, timeout=2)
                    except:
                        output = f"Fener {status} komutu simüle edildi (Termux:API kurulu değil)"
                elif action == 'brightness':
                    try:
                        subprocess.run(['termux-brightness', str(val)], check=True, timeout=2)
                    except:
                        output = f"Parlaklık {val} komutu simüle edildi (Termux:API kurulu değil)"
                        
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'success', 'output': output}
                self.wfile.write(json.dumps(response).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'error', 'output': str(e)}
                self.wfile.write(json.dumps(response).encode('utf-8'))

        elif self.path == '/api/pip/manage':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                action = data.get('action', '')
                package = data.get('package', '')
                
                if not package:
                    raise Exception('Paket adı eksik!')
                
                if action == 'install':
                    cmd = ['pip', 'install', package]
                elif action == 'uninstall':
                    cmd = ['pip', 'uninstall', '-y', package]
                else:
                    raise Exception('Geçersiz işlem!')
                    
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                output, _ = proc.communicate(timeout=60)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'success', 'output': output}
                self.wfile.write(json.dumps(response).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'error', 'output': str(e)}
                self.wfile.write(json.dumps(response).encode('utf-8'))

        elif self.path == '/api/backup':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            try:
                import zipfile
                upload_dir = os.path.join(os.getcwd(), 'uploads')
                backup_name = 'vps_uploads_backup.zip'
                backup_path = os.path.join(os.getcwd(), backup_name)
                
                if not os.path.exists(upload_dir) or len(os.listdir(upload_dir)) == 0:
                    raise Exception('Yedeklenecek dosya yok (uploads klasörü boş)!')
                
                with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for root, dirs, files in os.walk(upload_dir):
                        for file in files:
                            zipf.write(os.path.join(root, file), os.path.relpath(os.path.join(root, file), os.path.join(upload_dir, '..')))
                
                # Move to uploads directory so it can be downloaded via file manager
                dest_path = os.path.join(upload_dir, backup_name)
                if os.path.exists(dest_path):
                    os.remove(dest_path)
                os.rename(backup_path, dest_path)
                
                response = {'status': 'success', 'output': f'Yedekleme oluşturuldu ve indirilebilir: {backup_name}', 'file': backup_name}
            except Exception as e:
                response = {'status': 'error', 'output': str(e)}
                
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return

        elif self.path == '/api/delete':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                file_name = data.get('name', '')
                
                if not file_name or '..' in file_name or '/' in file_name or '\\' in file_name:
                    raise Exception('Geçersiz dosya adı!')
                
                upload_dir = os.path.join(os.getcwd(), 'uploads')
                file_path = os.path.join(upload_dir, file_name)
                
                if os.path.exists(file_path):
                    os.remove(file_path)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    response = {'status': 'success', 'output': f"'{file_name}' silindi."}
                else:
                    raise Exception('Dosya bulunamadı!')
                    
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'error', 'output': str(e)}
                self.wfile.write(json.dumps(response).encode('utf-8'))

        elif self.path == '/api/youtube':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            try:
                import time
                data = json.loads(post_data.decode('utf-8'))
                yt_url = data.get('url', '')
                fmt = data.get('format', '720')
                api_key = '921c198761efff19eee84e66c9a493ef7f3b4a7'  # sabit API key

                if not yt_url:
                    raise Exception('YouTube URL eksik!')

                # Step 1: Make initial request to savenow.to
                encoded_url = urllib.parse.quote(yt_url, safe='')
                api_url = (f"https://p.savenow.to/ajax/download.php"
                           f"?url={encoded_url}&format={fmt}&apikey={api_key}"
                           f"&add_info=1&allow_extended_duration=0&no_merge=0")

                req = urllib.request.Request(api_url)
                with urllib.request.urlopen(req, timeout=30) as resp:
                    api_response = json.loads(resp.read().decode('utf-8'))

                if not api_response.get('success'):
                    raise Exception(f"API hatası: {api_response}")

                # Step 2: Poll progress_url until download URL is ready
                download_link = api_response.get('url')
                progress_url = api_response.get('progress_url')
                title = api_response.get('title', 'video')

                if not download_link and progress_url:
                    print(f"[YT] Progress URL alındı: {progress_url}")
                    for attempt in range(90):  # max ~180 seconds
                        time.sleep(2)
                        try:
                            preq = urllib.request.Request(progress_url)
                            with urllib.request.urlopen(preq, timeout=15) as presp:
                                raw = presp.read().decode('utf-8')
                                progress_data = json.loads(raw)

                            # Log every 5 attempts so user can see progress
                            if attempt % 5 == 0:
                                print(f"[YT] Attempt {attempt+1}: {raw[:300]}")

                            # Try every possible field name for the download URL
                            download_link = (
                                progress_data.get('url') or
                                progress_data.get('download_url') or
                                progress_data.get('link') or
                                progress_data.get('file_url') or
                                progress_data.get('output_url') or
                                progress_data.get('result_url') or
                                progress_data.get('direct_url')
                            )
                            title = progress_data.get('title', title)

                            if download_link:
                                print(f"[YT] Download URL bulundu!")
                                break

                            status_text = progress_data.get('text') or progress_data.get('status') or 'bekleniyor...'
                            print(f"[YT] ({attempt+1}/90): {status_text}")

                        except Exception as poll_err:
                            print(f"[YT] Poll hatası ({attempt+1}): {poll_err}")
                            continue

                if not download_link:
                    raise Exception('Zaman aşımı: Video hazır olmadı. API response: Son progress yanıtı için server loglarını kontrol edin.')

                # Step 3: Download the file to uploads folder
                upload_dir = os.path.join(os.getcwd(), 'uploads')
                if not os.path.exists(upload_dir):
                    os.makedirs(upload_dir)

                title = title.replace('/', '_').replace('\\', '_')
                ext = 'mp3' if fmt == 'mp3' else 'mp4'
                safe_title = "".join(c for c in title if c.isalnum() or c in ' ._-')[:80].strip()
                if not safe_title:
                    safe_title = 'video'
                file_name = f"{safe_title}.{ext}"
                out_path = os.path.join(upload_dir, file_name)

                urllib.request.urlretrieve(download_link, out_path)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'success', 'output': f"'{file_name}' başarıyla indirildi!", 'title': title}
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
    
    # allow_reuse_address fixes "errno 98: Address already in use" on restart
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), TermuxHandler) as httpd:
        print(f"Termux VPS Console is running on Phone WebPanel : http://localhost:{PORT}")
        print(f"Termux VPS Console is running on Computer WebPanel : http://192.168.1.157:{PORT}/")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
