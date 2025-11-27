import cron from 'node-cron';
import Match from '../models/Match.js';
import { ScraperService } from '../services/ScraperService.js';

const scraper = new ScraperService();
let isScrapingActive = false;
let scrapingTimeout: NodeJS.Timeout | null = null;

const getRandomInterval = () => Math.floor(Math.random() * (120000 - 40000 + 1) + 40000);

const runScrapingCycle = async () => {
    if (!isScrapingActive) return;

    try {
        await scraper.updateLiveMatches();
    } catch (error) {
        console.error("Error en ciclo de scraping:", error);
    }

    if (isScrapingActive) {
        const nextDelay = getRandomInterval();
        console.log(`⏱️ Próximo escaneo en ${Math.round(nextDelay / 1000)} segundos...`);
        scrapingTimeout = setTimeout(runScrapingCycle, nextDelay);
    }
};

const checkMatchWindows = async () => {
    if (ScraperService.isSeeding) return;

    try {
        const now = new Date();
        const fiveMinFromNow = new Date(now.getTime() + 5 * 60000);
        const twoHoursAgo = new Date(now.getTime() - 125 * 60000);

        const activeMatches = await Match.find({
            matchDate: { 
                $lte: fiveMinFromNow, 
                $gte: twoHoursAgo 
            },
            status: { $nin: ['FINISHED', 'POSTPONED', 'SUSPENDED'] }
        });

        const shouldScrape = activeMatches.length > 0;

        if (shouldScrape && !isScrapingActive) {
            console.log(`🚨 ¡HORA DE PARTIDO! Hay ${activeMatches.length} partidos activos.`);
            isScrapingActive = true;
            runScrapingCycle();
        }
        else if (!shouldScrape && isScrapingActive) {
            console.log("zzZ No hay partidos activos. Pausando.");
            isScrapingActive = false;
            if (scrapingTimeout) clearTimeout(scrapingTimeout);
        }

    } catch (error) {
        console.error("Error chequeando ventanas:", error);
    }
};

export const initJobs = () => {
    console.log("📅 Sistema de Cron Inteligente INICIADO.");
    cron.schedule('* * * * *', () => {
        checkMatchWindows();
    });
    checkMatchWindows();
};