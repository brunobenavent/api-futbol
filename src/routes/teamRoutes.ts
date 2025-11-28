import { Router } from 'express';
import { getTeamById, getAllTeams } from '../controllers/TeamController.js';

const router = Router();

router.get('/', getAllTeams);
router.get('/:id', getTeamById);

export default router;