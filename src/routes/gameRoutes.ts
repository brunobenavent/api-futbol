import { Router } from 'express';
import { joinGame, makePick, evaluateRound } from '../controllers/GameLogicController.js';
import { protect } from '../middlewares/auth.js'; // (Asumiendo que ya tienes el middleware auth.ts)

const router = Router();
router.post('/join', protect, joinGame);
router.post('/pick', protect, makePick);
router.post('/evaluate', protect, evaluateRound); // Debería ser solo admin
export default router;