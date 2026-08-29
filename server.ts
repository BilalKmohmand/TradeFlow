import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Sarmaya Pakistani Bulk Trading & Logistics Engine',
      whatsappWebhook: 'active',
      timestamp: new Date().toISOString(),
    });
  });

  // Simulated WhatsApp Cloud API / Twilio Webhook Dispatch Endpoint
  app.post('/api/whatsapp/send', (req, res) => {
    const { to, message, type } = req.body;
    console.log(`[WhatsApp Engine] Sending ${type || 'alert'} to ${to}: ${message?.slice(0, 60)}...`);

    res.json({
      success: true,
      messageId: `wamid_${Date.now()}`,
      status: 'delivered',
      timestamp: new Date().toISOString(),
    });
  });

  // Automated overdue reminder check endpoint
  app.post('/api/automation/overdue-reminders', (req, res) => {
    res.json({
      success: true,
      triggeredAt: new Date().toISOString(),
      status: 'Automated overdue check processed',
    });
  });

  // Vite middleware for development / static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sarmaya Server running on port ${PORT}`);
  });
}

startServer();
