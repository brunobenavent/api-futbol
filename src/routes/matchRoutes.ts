import { Router } from 'express';
import { 
    getMatches, 
    getMatchById, 
    getMatchesByRound, 
    getCurrentRound 
} from '../controllers/MatchController.js';

const router = Router();

router.get('/current-round', getCurrentRound); 
router.get('/', getMatches);
router.get('/:id', getMatchById);
router.get('/:season/:round', getMatchesByRound);

export default router;