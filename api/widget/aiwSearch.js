import express from 'express';
import { retrieveTopK } from '../../services/web_crawler/core.js';

const retrieveRouter = express.Router();

retrieveRouter.get('/aiw/search', async (req,res)=>{
  try {
    const siteId = String(req.query.siteId || 'demo');
    const q = String(req.query.q || '').trim();
    const k = Math.max(1, Math.min(10, parseInt(req.query.k || '5',10)));
    if (!q) return res.status(400).json({ error: 'Missing q' });
    const results = await retrieveTopK(siteId, q, { k });
    res.json({ siteId, q, k, results });
  } catch (e) {
    console.error('[/aiw/search]', e);
    res.status(500).json({ error:'search_failed' });
  }
});

export default retrieveRouter;
