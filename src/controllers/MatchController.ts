import { Request, Response } from 'express';
import { ScraperService } from '../services/ScraperService.js';
import Match from '../models/Match.js';

const scraper = new ScraperService();

export const getMatches = async (req: Request, res: Response) => {
  try {
    const { season, round } = req.query;
    const query: any = {};
    if (season) query.season = season;
    if (round) query.round = round;

    const matches = await Match.find(query).sort({ round: 1 });
    res.json(matches);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo partidos' });
  }
};

export const seedSeason = async (req: Request, res: Response) => {
    const { season } = req.params;
    if (!season) return res.status(400).send("Falta season");
    res.send(`🚀 Seed iniciado para ${season}.`);
    scraper.scrapeFullSeason(season).catch(err => console.error(err));
};

export const hydrateRound = async (req: Request, res: Response) => {
  const { season, round } = req.params;
  try {
    const roundNumber = parseInt(round); // <--- CORRECCIÓN CRÍTICA
    const matches = await Match.find({ season, round: roundNumber });

    if (matches.length === 0) return res.status(404).send("No hay partidos.");

    res.send(`🚀 Iniciando hidratación de J${round}.`);

    (async () => {
        console.log(`💧 Hidratando J${round}...`);
        for (const match of matches) {
            console.log(`>> ${match.homeTeam} vs ${match.awayTeam}`);
            await scraper.scrapeMatchDetail(match.matchUrl);
            await new Promise(r => setTimeout(r, 3000));
        }
        console.log(`✅ Hidratación completada.`);
    })();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).send("Error");
  }
};