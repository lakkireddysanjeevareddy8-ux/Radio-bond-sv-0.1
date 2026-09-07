const http = require('http');
const { exec } = require('child_process');
const path = require('path');

const PORT = 5005;
const scriptPath = path.resolve(__dirname, 'open_quick_settings.ps1');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const target = url.searchParams.get('target') || 'quicksettings';

  if (pathname === '/scan-wifi') {
    exec('netsh wlan show networks mode=bssid', (err, stdout, stderr) => {
      if (err || !stdout) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err ? err.message : 'Scan failed', networks: [] }));
        return;
      }

      const networks = [];
      const lines = stdout.split('\n');
      let currentSsid = '';
      let currentAuth = 'WPA2';
      let currentBssid = '';
      let currentSignal = 70;
      let currentChannel = 1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('SSID ')) {
          const match = line.match(/^SSID \d+\s*:\s*(.*)$/);
          if (match) {
            currentSsid = match[1].trim();
          }
        } else if (line.startsWith('Authentication')) {
          const parts = line.split(':');
          if (parts.length > 1) {
            const authStr = parts[1].trim();
            if (authStr.includes('WPA3')) currentAuth = 'WPA3';
            else if (authStr.includes('Open')) currentAuth = 'OPEN';
            else currentAuth = 'WPA2';
          }
        } else if (line.startsWith('BSSID 1')) {
          const parts = line.split(':');
          if (parts.length > 1) {
            currentBssid = parts.slice(1).join(':').trim();
          }
        } else if (line.startsWith('Signal')) {
          const parts = line.split(':');
          if (parts.length > 1) {
            const sigStr = parts[1].replace('%', '').trim();
            currentSignal = parseInt(sigStr, 10) || 50;
          }
        } else if (line.startsWith('Channel')) {
          const parts = line.split(':');
          if (parts.length > 1) {
            currentChannel = parseInt(parts[1].trim(), 10) || 1;
          }
          // After channel, push network
          if (currentSsid && currentSsid.length > 0) {
            // Convert percent to dBm approx: 100% -> -50dBm, 0% -> -100dBm
            const rssi = Math.round((currentSignal / 2) - 100);
            networks.push({
              ssid: currentSsid,
              bssid: currentBssid,
              rssi,
              signalPercent: currentSignal,
              security: currentAuth,
              channel: currentChannel,
            });
            currentSsid = '';
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: networks.length, networks }));
    });
    return;
  }

  console.log(`[Windows Bridge] Request to open: ${target}`);

  if (target === 'bluetooth') {
    // Open Windows Bluetooth Settings and also trigger Quick Settings flyout
    exec('powershell -Command "Start-Process \'ms-settings:bluetooth\'"', (err) => {
      if (err) console.error('Error opening bluetooth settings:', err);
    });
    // Trigger Win+A Quick Settings flyout
    exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, (err) => {
      if (err) console.error('Error triggering Quick Settings flyout:', err);
    });
  } else if (target === 'wifi') {
    // Open Windows network flyout and WiFi settings
    exec('powershell -Command "Start-Process \'ms-availablenetworks:\'"', (err) => {
      if (err) {
        exec('powershell -Command "Start-Process \'ms-settings:network-wifi\'"');
      }
    });
    // Also trigger Quick Settings flyout
    exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, (err) => {
      if (err) console.error('Error triggering Quick Settings flyout:', err);
    });
  } else {
    // Default: trigger Win+A Quick Settings flyout (the exact flyout from user's screenshot!)
    exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, (err) => {
      if (err) console.error('Error triggering Quick Settings flyout:', err);
    });
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true, target }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Windows Bridge] Running on http://127.0.0.1:${PORT}`);
});
