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
  const target = url.searchParams.get('target') || 'quicksettings';

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
