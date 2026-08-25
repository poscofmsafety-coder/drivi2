const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const app = require('./lib/expressApp');

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

function lanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

const ip = lanIp();

http.createServer(app).listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP 서버 실행 중: http://localhost:${PORT}${ip ? ` (같은 네트워크: http://${ip}:${PORT})` : ''}`);
});

const certPath = path.join(__dirname, 'certs', 'server.cert');
const keyPath = path.join(__dirname, 'certs', 'server.key');
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const options = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  https.createServer(options, app).listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`HTTPS 서버 실행 중 (음성입력 등 마이크 기능은 이 주소가 필요해요): https://localhost:${HTTPS_PORT}${ip ? ` (휴대폰: https://${ip}:${HTTPS_PORT})` : ''}`);
  });
} else {
  console.log('HTTPS 인증서가 없어 HTTPS 서버는 실행하지 않습니다 (certs/server.key, certs/server.cert 필요).');
}
module.exports = app;