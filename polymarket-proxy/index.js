const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET = process.env.PROXY_SECRET || '';

// Auth middleware — block random traffic
app.use((req, res, next) => {
  if (SECRET && req.headers['x-proxy-secret'] !== SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', region: process.env.RENDER_REGION || 'unknown' }));

// Proxy all other requests to Polymarket CLOB
app.use('/', createProxyMiddleware({
  target: 'https://clob.polymarket.com',
  changeOrigin: true,
  onProxyReq: (proxyReq) => {
    // Remove our custom auth header before forwarding
    proxyReq.removeHeader('x-proxy-secret');
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'Proxy error', message: err.message });
  }
}));

app.listen(PORT, () => {
  console.log(`Polymarket CLOB proxy running on port ${PORT}`);
});
