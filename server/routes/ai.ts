
import express from 'express';
import { generateBackupConfig } from '../services/ai/generator.js';

const router = express.Router();

// POST /api/ai/generate
router.post('/generate', async (req, res) => {
    try {
        const { prompt, config } = req.body;

        if (!prompt) {
            res.status(400).json({ error: 'Prompt is required' });
            return;
        }

        if (!config) {
            res.status(400).json({ error: 'AI Config is required' });
            return;
        }

        const result = await generateBackupConfig(prompt, config);
        res.json(result);
    } catch (error: any) {
        console.error('AI Generation failed:', error);
        res.status(500).json({ error: error.message || 'Failed to generate configuration' });
    }
});

export default router;
