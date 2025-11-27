import { Request, Response } from 'express';
import { ScraperService } from '../services/ScraperService.js';

const scraper = new ScraperService();

// Scrapeo de una jornada completa
export const triggerScrape = async (req: Request, res: Response) => {
  try {
    const { season, round } = req.params;
    const roundNumber = parseInt(round);
    console.log(`Petición manual: Temporada ${season}, Jornada ${roundNumber}`);
    scraper.scrapeRound(season, roundNumber); 
    res.send(`🤖 Scraping iniciado para ${season} J${roundNumber}. Mira la terminal.`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error iniciando scraper');
  }
};

// NUEVO: Hidratar (rellenar) un partido específico con detalles
export const forceUpdateMatch = async (req: Request, res: Response) => {
  try {
    // Ejemplo: /api/hydrate-match?url=https://...
    const { url } = req.query; 

    if (!url || typeof url !== 'string') {
        return res.status(400).send("Falta el parámetro 'url'");
    }

    console.log(`💉 Inyectando detalles para: ${url}`);
    
    // Ejecutamos el scraper profundo
    // No usamos await para no bloquear la respuesta HTTP si tarda mucho
    scraper.scrapeMatchDetail(url);

    res.send(`✅ Proceso iniciado para ${url}. Revisa la consola en 1 minuto.`);
  } catch (error) {
    res.status(500).send('Error actualizando detalles del partido');
  }
};