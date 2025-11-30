import { Router } from 'express';
import { triggerScrape, forceUpdateMatch } from '../controllers/ScraperController.js';
import { seedSeason, hydrateRound, syncStadiums } from '../controllers/MatchController.js';
import { getPendingUsers, createGame, manageTokens } from '../controllers/AdminController.js';
import { protect, restrictTo } from '../middlewares/auth.js'; 

const router = Router();

// Mantenimiento
router.get('/api/seed/:season', seedSeason);
router.get('/api/hydrate-round/:season/:round', hydrateRound);
router.get('/api/hydrate-match', forceUpdateMatch);
router.get('/api/sync-stadiums', syncStadiums);
router.get('/test-scrape/:season/:round', triggerScrape);

// Panel Admin (Protegido)
router.get('/admin/users/pending', protect, restrictTo('ADMIN'), getPendingUsers);
router.post('/admin/games', protect, restrictTo('ADMIN'), createGame);

// 👇 ESTA ES LA RUTA DEL BANQUERO 👇
router.post('/admin/tokens', protect, restrictTo('ADMIN'), manageTokens);

export default router;