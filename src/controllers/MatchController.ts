import { Request, Response } from 'express';
import Match from '../models/Match.js';
import Season from '../models/Season.js';
import Team from '../models/Team.js'; // Necesario para el populate
import { ScraperService } from '../services/ScraperService.js';

// Instanciamos el servicio una sola vez
const scraper = new ScraperService();

// ==========================================
//  HELPERS INTERNOS (Lógica Inteligente)
// ==========================================

/**
 * Calcula el año de la temporada automáticamente.
 * Si estamos en Julio (Mes 6) o más, es el año siguiente.
 */
const getAutoSeasonYear = (): string => {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0 = Enero, 11 = Diciembre
    // Si estamos en la segunda mitad del año (Julio en adelante), la temporada es "2026" (aunque estemos en 2025)
    // Ajusta esto según cómo guardes tus temporadas (2025 o 2026)
    if (currentMonth >= 6) return (now.getFullYear() + 1).toString();
    return now.getFullYear().toString();
};

/**
 * LÓGICA MAESTRA: Adivinar la jornada actual.
 * Soluciona el problema de los partidos aplazados (J16 apareciendo cuando estamos en J24).
 */
export const getActiveRoundNumber = async (): Promise<number> => {
    const autoSeason = getAutoSeasonYear();
    const seasonDoc = await Season.findOne({ year: autoSeason });
    
    if (!seasonDoc) return 1;

    const now = new Date();
    // Buffer: Incluimos partidos que empezaron hace 4 horas (por si están LIVE terminando)
    const bufferDate = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    // 1. Buscamos los próximos 10 partidos (SCHEDULED o LIVE)
    const nextMatches = await Match.find({
        season: seasonDoc._id,
        status: { $in: ['SCHEDULED', 'LIVE'] }, 
        matchDate: { $gte: bufferDate }
    })
    .sort({ matchDate: 1 }) // Los más cercanos primero
    .limit(10); // Analizamos una muestra de 10 partidos

    if (nextMatches.length > 0) {
        // TRUCO: Contamos qué jornada se repite más en los próximos partidos.
        // Si hay un partido suelto de la J16 y ocho de la J24, ganará la J24.
        const roundCounts: { [key: number]: number } = {};
        
        nextMatches.forEach(m => {
            roundCounts[m.round] = (roundCounts[m.round] || 0) + 1;
        });

        // Encontramos la jornada con más apariciones
        let bestRound = nextMatches[0].round;
        let maxCount = 0;

        for (const [round, count] of Object.entries(roundCounts)) {
            if (count > maxCount) {
                maxCount = count;
                bestRound = Number(round);
            }
        }
        
        return bestRound;
    }

    // 2. Si no hay partidos futuros (Fin de temporada o parón largo), devolvemos la última jugada.
    const lastMatch = await Match.findOne({
        season: seasonDoc._id,
        status: 'FINISHED'
    }).sort({ matchDate: -1 });

    return lastMatch ? lastMatch.round : 1;
};


// ==========================================
//  MÉTODOS PÚBLICOS (API Frontend)
// ==========================================

/**
 * Obtener la jornada actual calculada
 * GET /api/matches/current-round
 */
export const getCurrentRound = async (req: Request, res: Response) => {
    try {
        // Usamos la lógica inteligente
        const round = await getActiveRoundNumber();
        const autoSeason = getAutoSeasonYear();
        
        const seasonDoc = await Season.findOne({ year: autoSeason });
        if (!seasonDoc) return res.status(404).json({ message: "Temporada no encontrada" });

        // Buscamos los partidos de esa jornada ganadora
        const matches = await Match.find({ 
            season: seasonDoc._id, 
            round: round 
        })
        .populate('homeTeam', 'name slug badge logo stadium')
        .populate('awayTeam', 'name slug badge logo stadium')
        .sort({ matchDate: 1 });

        // Determinamos el estado global de la jornada para el frontend
        const isLive = matches.some(m => m.status === 'LIVE');
        const isScheduled = matches.some(m => m.status === 'SCHEDULED');
        const status = isLive ? 'LIVE' : (isScheduled ? 'SCHEDULED' : 'FINISHED');

        res.json({
            season: autoSeason,
            currentRound: round,
            status,
            matches
        });
    } catch (error) {
        console.error("Error en getCurrentRound:", error);
        res.status(500).json({ error: "Error calculando jornada actual" });
    }
};

/**
 * Obtener partidos con filtros
 * GET /api/matches?round=22&season=2026
 */
export const getMatches = async (req: Request, res: Response) => {
  try {
    const { round, season, team, status } = req.query;
    const filter: any = {};

    if (season) {
      const seasonDoc = await Season.findOne({ year: String(season) });
      if (seasonDoc) filter.season = seasonDoc._id;
    }

    if (round) filter.round = Number(round);
    if (status) filter.status = String(status);
    
    if (team) {
       filter.$or = [{ homeTeam: team }, { awayTeam: team }];
    }

    const matches = await Match.find(filter)
      .populate('homeTeam', 'name slug badge logo stadium')
      .populate('awayTeam', 'name slug badge logo stadium')
      .sort({ matchDate: 1 });

    res.json({
      success: true,
      count: matches.length,
      data: matches
    });

  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener partidos' });
  }
};

/**
 * Obtener un solo partido por ID
 * GET /api/matches/:id
 */
export const getMatchById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id)
      .populate('homeTeam')
      .populate('awayTeam')
      .populate('season');
      
    if (!match) return res.status(404).json({ success: false, error: 'Partido no encontrado' });
    
    res.json({ success: true, data: match });

  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * Obtener partidos de una jornada específica
 * GET /api/matches/:season/:round
 */
export const getMatchesByRound = async (req: Request, res: Response) => {
    try {
        const { season, round } = req.params;

        const seasonDoc = await Season.findOne({ year: season });
        if (!seasonDoc) return res.status(404).json({ error: "Temporada no encontrada" });

        const matches = await Match.find({ 
            season: seasonDoc._id, 
            round: Number(round) 
        })
        .populate('homeTeam', 'name slug badge logo')
        .populate('awayTeam', 'name slug badge logo')
        .sort({ matchDate: 1 });

        res.json({ success: true, count: matches.length, data: matches });

    } catch (error) {
        res.status(500).json({ error: "Error obteniendo la jornada" });
    }
};

// ==========================================
//  MÉTODOS ADMIN (Mantenimiento)
// ==========================================

/**
 * Hidratar una jornada completa (Arreglar fechas y resultados)
 * GET /api/hydrate-round/:season/:round
 */
export const hydrateRound = async (req: Request, res: Response) => {
    try {
        const { season, round } = req.params;
        
        console.log(`🚀 [ADMIN] Iniciando hidratación manual de Jornada ${round} - Temp ${season}...`);
        
        // Llamada asíncrona al scraper (no bloqueamos la respuesta HTTP)
        scraper.scrapeRound(String(season), Number(round));

        res.json({ 
            success: true,
            message: `Proceso de scraping iniciado para Jornada ${round}. Revisa la consola.`
        });

    } catch (error) {
        console.error("❌ Error en hydrateRound:", error);
        res.status(500).json({ success: false, error: 'Error al hidratar' });
    }
};

/**
 * Inicializar una temporada
 * GET /api/seed/:season
 */
export const seedSeason = async (req: Request, res: Response) => {
    try {
        const { season } = req.params;
        console.log(`🌱 [ADMIN] Sembrando temporada ${season}...`);

        let seasonDoc = await Season.findOne({ year: season });
        if (!seasonDoc) {
            seasonDoc = await Season.create({ 
                year: season, 
                name: `Temporada ${season}/${Number(season)+1}` 
            });
            console.log("✅ Temporada creada en BD.");
        }
        
        res.json({ success: true, message: `Temporada ${season} lista.`, seasonId: seasonDoc._id });

    } catch (error) {
        res.status(500).json({ error: 'Error al sembrar temporada' });
    }
};

/**
 * Sincronizar Estadios
 * GET /api/sync-stadiums
 */
export const syncStadiums = async (req: Request, res: Response) => {
    try {
        console.log("🏟️ [ADMIN] Sincronizando estadios...");
        
        const matches = await Match.find({ stadium: null }).populate('homeTeam');
        let updatedCount = 0;

        for (const match of matches) {
            const homeTeam = match.homeTeam as any; 
            if (homeTeam && homeTeam.stadium) {
                match.stadium = homeTeam.stadium;
                await match.save();
                updatedCount++;
            }
        }

        res.json({ success: true, updated: updatedCount });

    } catch (error) {
        res.status(500).json({ error: 'Error sincronizando estadios' });
    }
};