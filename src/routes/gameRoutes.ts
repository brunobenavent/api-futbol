import { Router } from 'express';
import { 
    joinGame, 
    makePick, 
    updatePick, // <--- Asegúrate de importar esto
    deletePick, // <--- Y esto
    evaluateRound 
} from '../controllers/GameLogicController.js';
import { getGameDetails } from '../controllers/AdminController.js'; 
import { protect } from '../middlewares/auth.js';

const router = Router();

router.post('/join', protect, joinGame);

// --- ESTAS SON LAS RUTAS DE PREDICCIÓN ---
router.post('/pick', protect, makePick);     // Crear (POST)
router.put('/pick', protect, updatePick);    // Modificar (PUT) <--- ESTA ES LA QUE FALLA
router.delete('/pick', protect, deletePick); // Borrar (DELETE)

router.post('/evaluate', protect, evaluateRound);
router.get('/:id', protect, getGameDetails); 

export default router;