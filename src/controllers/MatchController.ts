import { Request, Response } from 'express';
import { ScraperService } from '../services/ScraperService.js';
import Match from '../models/Match.js';
import Season from '../models/Season.js';
import '../models/Team.js'; // Importante para el populate

const scraper = new ScraperService();

// Helper: Calcular año de la temporada
const getAutoSeasonYear = (): string => {
    const now = new Date();
    const currentMonth = now.getMonth(); 
    if (currentMonth >= 6) return (now.getFullYear() + 1).toString();
    return now.getFullYear().toString();
};

// --- HELPER EXPORTADO (MEJORADO PARA EVITAR JORNADA 0) ---
export const getActiveRoundNumber = async (): Promise<number> => {
    const autoSeason = getAutoSeasonYear();
    const seasonDoc = await Season.findOne({ year: autoSeason });
    
    if (!seasonDoc) return 1;

    const now = new Date();

    // 1. Buscamos el primer partido futuro (o actual)
    const nextMatch = await Match.findOne({
        season: seasonDoc._id,
        matchDate: { $gte: now } 
    }).sort({ matchDate: 1 }).select('round'); 

    if (nextMatch) return nextMatch.round;

    // 2. Si no hay futuro (final de temporada), buscamos el último jugado
    // ESTO ARREGLA EL "JORNADA 0"
    const lastMatch = await Match.findOne({
        season: seasonDoc._id
    }).sort({ matchDate: -1 }).select('round');

    return lastMatch ? lastMatch.round : 1;
};

// --- CONTROLADORES ---

export const getMatches = async (req: Request, res: Response) => {
  try {
    const { season, round } = req.query;
    const query: any = {};
    
    if (season) {
        const seasonDoc = await Season.findOne({ year: season });
        if (seasonDoc) query.season = seasonDoc._id;
        else return res.json([]); 
    }
    if (round) query.round = round;

    const matches = await Match.find(query).sort({ round: 1 }).populate('homeTeam awayTeam season');
    res.json(matches);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

export const getMatchById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const match = await Match.findById(id).populate('homeTeam awayTeam season');
      if (!match) return res.status(404).json({ message: 'Partido no encontrado' });
      res.json(match);
    } catch (error) { res.status(500).json({ message: 'Error' }); }
};

export const getMatchesByRound = async (req: Request, res: Response) => {
    const { season, round } = req.params;
    try {
        const seasonDoc = await Season.findOne({ year: season });
        if (!seasonDoc) return res.status(404).json({ message: 'Temporada no encontrada' });
        const matches = await Match.find({ season: seasonDoc._id, round: parseInt(round) }).populate('homeTeam awayTeam season');
        res.json(matches);
    } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// ENDPOINT PRINCIPAL DEL DASHBOARD (Jornada Actual)
export const getCurrentRound = async (req: Request, res: Response) => {
  try {
    const seasonYear = req.query.season ? String(req.query.season) : getAutoSeasonYear();
    const seasonDoc = await Season.findOne({ year: seasonYear });
    
    if (!seasonDoc) return res.status(404).json({ message: "Temporada no iniciada", currentRound: 1, matches: [] });

    // Usamos el helper mejorado
    const targetRound = await getActiveRoundNumber();

    const matches = await Match.find({
        season: seasonDoc._id,
        round: targetRound
    })
    .sort({ matchDate: 1 })
    .populate('homeTeam')
    .populate('awayTeam');

    // Calculamos estado global visual
    const activeMatches = matches.filter(m => m.status === 'LIVE').length;
    const scheduledMatches = matches.filter(m => m.status === 'SCHEDULED').length;
    let status = 'FINISHED';
    if (activeMatches > 0) status = 'LIVE';
    else if (scheduledMatches > 0) status = 'SCHEDULED';

    res.json({ 
        season: seasonYear, 
        currentRound: targetRound, 
        status: status, 
        matches: matches 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error calculando jornada', currentRound: 0, matches: [] });
  }
};

// --- MANTENIMIENTO ---

export const seedSeason = async (req: Request, res: Response) => {
    const { season } = req.params;
    if (!season) return res.status(400).send("Falta season");
    res.send(`🚀 Seed iniciado para ${season}.`);
    scraper.scrapeFullSeason(season).catch(err => console.error(err));
};

export const hydrateRound = async (req: Request, res: Response) => {
  const { season, round } = req.params;
  try {
    const roundNumber = parseInt(round);
    const seasonDoc = await Season.findOne({ year: season });
    if (!seasonDoc) return res.status(404).send("Temporada no encontrada");
    const matches = await Match.find({ season: seasonDoc._id, round: roundNumber }).populate('homeTeam awayTeam');
    if (matches.length === 0) return res.status(404).send("No hay partidos.");

    res.send(`🚀 Hidratando J${round}.`);
    (async () => {
        for (const match of matches) {
            await scraper.scrapeMatchDetail(match.matchUrl);
            await new Promise(r => setTimeout(r, 2000));
        }
    })();
  } catch (error) { if (!res.headersSent) res.status(500).send("Error"); }
};

export const syncStadiums = async (req: Request, res: Response) => {
    try {
      const matchesWithStadium = await Match.find({ stadium: { $ne: null, $exists: true } });
      if (matchesWithStadium.length === 0) return res.send("No hay datos.");
      res.send(`🔄 Sincronizando...`);
      (async () => {
          for (const match of matchesWithStadium) {
              if (match.homeTeam && match.stadium) {
                  const TeamModel = (await import('../models/Team.js')).default;
                  await TeamModel.findByIdAndUpdate(match.homeTeam, { stadium: match.stadium });
              }
          }
      })();
    } catch (error) { if (!res.headersSent) res.status(500).send("Error"); }
};