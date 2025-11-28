import cron from 'node-cron';
import Match from '../models/Match.js';
import { ScraperService } from '../services/ScraperService.js';

const scraper = new ScraperService();
let isScrapingActive = false;
let scrapingTimeout: NodeJS.Timeout | null = null;

const getRandomInterval = () => Math.floor(Math.random() * (120000 - 40000 + 1) + 40000);

const runScrapingCycle = async () => {
    if (!isScrapingActive) return;
    try { await scraper.updateLiveMatches(); } catch (e) { console.error(e); }

    if (isScrapingActive) {
        const nextDelay = getRandomInterval();
        console.log(`⏱️ Próximo escaneo en ${Math.round(nextDelay / 1000)}s...`);
        scrapingTimeout = setTimeout(runScrapingCycle, nextDelay);
    }
};

const checkMatchWindows = async () => {
    if (ScraperService.isSeeding) return;
    try {
        const now = new Date();
        const activeMatches = await Match.find({
            matchDate: { 
                $lte: new Date(now.getTime() + 5 * 60000), 
                $gte: new Date(now.getTime() - 125 * 60000) 
            },
            status: { $nin: ['FINISHED', 'POSTPONED', 'SUSPENDED'] }
        });

        const shouldScrape = activeMatches.length > 0;

        if (shouldScrape && !isScrapingActive) {
            console.log(`🚨 ¡HORA DE PARTIDO! Hay ${activeMatches.length} partidos activos.`);
            isScrapingActive = true;
            runScrapingCycle();
        } else if (!shouldScrape && isScrapingActive) {
            console.log("zzZ Pausando scraping.");
            isScrapingActive = false;
            if (scrapingTimeout) clearTimeout(scrapingTimeout);
        }
    } catch (e) { console.error(e); }
};

export const initJobs = () => {
    console.log("📅 Sistema de Cron Inteligente INICIADO.");
    cron.schedule('* * * * *', () => checkMatchWindows());
    checkMatchWindows();
};