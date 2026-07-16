import http from 'http';
import { Client } from 'discord.js';

export const startHealthCheckServer = (client: Client) => {
  const PORT = parseInt(process.env.HEALTH_PORT || '5000', 10);
  const HOST = '127.0.0.1'; // 僅在本地開放，防止外網直接存取

  const server = http.createServer((req, res) => {
    // 僅允許 GET /health
    if (req.url === '/health' && req.method === 'GET') {
      const isReady = client && client.isReady();

      if (isReady) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'healthy',
            discordConnected: true,
            uptime: client.uptime,
            ping: client.ws.ping,
          })
        );
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'unhealthy',
            discordConnected: false,
          })
        );
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[HealthCheck] 本地健康檢查伺服器已啟動於 http://${HOST}:${PORT}/health`);
  });
};
