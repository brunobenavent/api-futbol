import { Router } from 'express';
import { 
    joinGame, makePick, updatePick, deletePick, evaluateRound,
    startGame, resurrectPlayer, closeResurrectionRound, getUserDashboard,
    votePact
} from '../controllers/GameLogicController.js';
import { getGameDetails } from '../controllers/AdminController.js'; 
import { protect, restrictTo } from '../middlewares/auth.js';

const router = Router();

// --- JUGADOR ---
router.post('/join', protect, joinGame);
router.post('/pick', protect, makePick);
router.put('/pick', protect, updatePick);
router.delete('/pick', protect, deletePick);
router.post('/resurrect', protect, resurrectPlayer);
router.post('/vote', protect, votePact);
router.get('/dashboard', protect, getUserDashboard);

// --- ADMIN ---
router.post('/start', protect, restrictTo('ADMIN'), startGame);
router.post('/evaluate', protect, restrictTo('ADMIN'), evaluateRound);
router.post('/close-resurrection', protect, restrictTo('ADMIN'), closeResurrectionRound);

// --- INFO ---
router.get('/:id', protect, getGameDetails); 

export default router;