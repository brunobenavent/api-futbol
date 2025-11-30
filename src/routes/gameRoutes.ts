import { Router } from 'express';
import { 
    joinGame, makePick, updatePick, deletePick, evaluateRound,
    startGame, resurrectPlayer, closeResurrectionRound // <--- NUEVAS
} from '../controllers/GameLogicController.js';
import { getGameDetails } from '../controllers/AdminController.js'; 
import { protect, restrictTo } from '../middlewares/auth.js';

const router = Router();

// --- JUGADOR ---
router.post('/join', protect, joinGame);
router.post('/pick', protect, makePick);
router.put('/pick', protect, updatePick);
router.delete('/pick', protect, deletePick);
router.post('/resurrect', protect, resurrectPlayer); // <--- Pagar para revivir

// --- ADMIN / SISTEMA ---
router.post('/start', protect, restrictTo('ADMIN'), startGame); // <--- Iniciar manualmente
router.post('/evaluate', protect, restrictTo('ADMIN'), evaluateRound);
router.post('/close-resurrection', protect, restrictTo('ADMIN'), closeResurrectionRound); // <--- Cerrar fase de compra

// --- INFO ---
router.get('/:id', protect, getGameDetails); 

export default router;