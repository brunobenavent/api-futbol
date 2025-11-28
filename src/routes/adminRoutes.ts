import { Router } from 'express';
import { triggerScrape, forceUpdateMatch } from '../controllers/ScraperController.js';
import { seedSeason, hydrateRound, syncStadiums } from '../controllers/MatchController.js';

const router = Router();

// --- Rutas de Gestión Interna ---

// Carga Masiva (Seed)
router.get('/api/seed/:season', seedSeason);

// Hidratación
router.get('/api/hydrate-round/:season/:round', hydrateRound);
router.get('/api/hydrate-match', forceUpdateMatch);

// Sincronización
router.get('/api/sync-stadiums', syncStadiums);

// Test Manual
router.get('/test-scrape/:season/:round', triggerScrape);

export default router;