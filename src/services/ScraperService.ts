import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// @ts-ignore
import UserAgent from 'user-agents';
import Match from '../models/Match.js'; 

(puppeteer as any).use(StealthPlugin());

export class ScraperService {

  public static isSeeding = false;

  private async randomDelay(min: number, max: number) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // --- CONFIGURACIÓN CENTRALIZADA DEL NAVEGADOR ---
  private async launchBrowser() {
    // En Railway (producción) usará la variable de entorno. En tu Mac, la ruta fija.
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

    return await (puppeteer as any).launch({
      // 'new' = Invisible (Fantasma) | false = Visible
      headless: 'new', 
      
      executablePath: executablePath,
      ignoreHTTPSErrors: true, 
      defaultViewport: null,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--start-maximized',
        '--disable-dev-shm-usage', // Vital para Docker/Railway
        '--disable-features=IsolateOrigins,site-per-process',
        '--blink-settings=imagesEnabled=false' // Bloqueo ligero de imágenes para velocidad
      ]
    } as any);
  }

  // --- ELIMINADOR DE POPUPS Y COOKIES ---
  private async removeCookiesBruteForce(page: any) {
    try {
        await page.evaluate(() => {
            const selectorList = [
                '#qc-cmp2-container', '.qc-cmp2-container', 
                '#didomi-host', '.fc-consent-root', '.cookie-banner',
                '#login_rf', '.generic_dialog', '#betAgeConfirm2', '#betBlur'
            ];
            selectorList.forEach(sel => { 
                const el = document.querySelector(sel); 
                if (el) el.remove(); 
            });
            const buttons = Array.from(document.querySelectorAll('button, a.btn'));
            buttons.forEach((btn: any) => {
                const t = btn.innerText?.toUpperCase();
                if (t && (t.includes('ACEPTO') || t.includes('AGREE') || t.includes('CONSENT'))) btn.click();
            });
            document.body.style.overflow = 'auto';
        });
    } catch (e) {} 
    await this.randomDelay(500, 1000);
  }

  // --- SCRAPEO PROFUNDO (Detalle del Partido) ---
  public async scrapeMatchDetail(matchUrl: string) {
    console.log(`🔍 Analizando DETALLE: ${matchUrl}`);
    const browser = await this.launchBrowser();

    try {
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        const userAgent = new UserAgent({ deviceCategory: 'desktop' });
        await page.setUserAgent(userAgent.toString());

        try { await page.goto(matchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) {}
        
        await this.removeCookiesBruteForce(page);
        
        // Scroll para cargar datos
        await page.evaluate(async () => {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 1000));
        });

        const details = await page.evaluate(() => {
            // 1. ESTADIO (Búsqueda Global por texto)
            let stadium = null;
            const stadiumEl = document.querySelector('li[itemprop="location"] span[itemprop="name"]');
            if (stadiumEl) {
                stadium = stadiumEl.textContent?.replace('Estadio:', '').trim() || null;
            }

            // 2. MINUTO ACTUAL
            let currentMinute = null;
            const minEl = document.querySelector('.live_min') || document.querySelector('.jor-status');
            if (minEl) currentMinute = minEl.textContent?.trim();

            // 3. EVENTOS (Tabla Resumen)
            const events: any[] = [];
            const rows = document.querySelectorAll('.match-header-resume table tbody tr');

            rows.forEach(row => {
                const goalIcon = row.querySelector('.mhr-ico.gol');
                if (goalIcon) {
                    const cells = Array.from(row.querySelectorAll('td'));
                    if (cells.length >= 7) {
                        let minute = "";
                        let player = "";
                        let team = "";
                        const score = cells[3]?.textContent?.trim() || ""; 

                        if (cells[2].classList.contains('gol')) { // Local
                            team = 'home';
                            minute = cells[1].textContent?.trim() || "";
                            player = cells[0].textContent?.trim() || "Local";
                        } else if (cells[4].classList.contains('gol')) { // Visitante
                            team = 'away';
                            minute = cells[5].textContent?.trim() || "";
                            player = cells[6].textContent?.trim() || "Visitante";
                        }

                        if (minute) events.push({ minute, player, score, team });
                    }
                }
            });
            return { stadium, currentMinute, events };
        });

        console.log(`📝 Detalles: Estadio="${details.stadium}", Goles=${details.events.length}`);

        await Match.findOneAndUpdate(
            { matchUrl: matchUrl },
            { 
                stadium: details.stadium,
                currentMinute: details.currentMinute,
                events: details.events
            }
        );

    } catch (error) {
        console.error("❌ Error en detalle:", error);
    } finally {
        try { await browser.close(); } catch(e) {}
    }
  }

  // --- SCRAPEO GENERAL (Jornada) ---
  public async scrapeRound(season: string, round: number) {
    const url = `https://www.resultados-futbol.com/competicion/primera/${season}/grupo1/jornada${round}`;
    console.log(`📡 Scrapeando: Temporada ${season} - Jornada ${round}`);

    const browser = await this.launchBrowser();

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      const userAgent = new UserAgent({ deviceCategory: 'desktop', platform: 'MacIntel' });
      await page.setUserAgent(userAgent.toString());
      
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) {}
      await this.removeCookiesBruteForce(page);
      await page.waitForSelector('tr.vevent', { timeout: 20000 });

      const startYear = parseInt(season) - 1; 

      const matchesData = await page.evaluate((season: any, round: any, startYear: any) => {
        const rows = document.querySelectorAll('tr.vevent');
        const results: any[] = [];
        const monthMap: Record<string, number> = { 'Ene':0, 'Feb':1, 'Mar':2, 'Abr':3, 'May':4, 'Jun':5, 'Jul':6, 'Ago':7, 'Sep':8, 'Oct':9, 'Nov':10, 'Dic':11 };

        rows.forEach((row) => {
            const homeLink = row.querySelector('.equipo1 a')?.getAttribute('href'); 
            const awayLink = row.querySelector('.equipo2 a')?.getAttribute('href');
            const homeSlug = homeLink ? homeLink.split('/')[2] : null;
            const awaySlug = awayLink ? awayLink.split('/')[2] : null;
            
            // Logos (Soporte Lazy Load)
            const homeImg = row.querySelector('.equipo1 img');
            const awayImg = row.querySelector('.equipo2 img');
            const homeLogo = homeImg?.getAttribute('data-src') || homeImg?.getAttribute('src') || null;
            const awayLogo = awayImg?.getAttribute('data-src') || awayImg?.getAttribute('src') || null;

            // Fecha
            let rawDate = row.querySelector('.fecha')?.textContent?.trim() || "";
            let parsedDate = null;
            rawDate = rawDate.replace(/\s+/g, ' '); 
            const dateMatch = rawDate.match(/(\d{1,2})\s([A-Z][a-z]{2})(?:\s(\d{1,2}:\d{2}))?/);
            if (dateMatch) {
                const day = parseInt(dateMatch[1]);
                const monthStr = dateMatch[2]; 
                const timeStr = dateMatch[3] || "00:00"; 
                const monthIndex = monthMap[monthStr] !== undefined ? monthMap[monthStr] : -1;
                if (monthIndex !== -1) {
                    let year = startYear;
                    if (monthIndex < 6) year = parseInt(season);
                    const [hours, minutes] = timeStr.split(':').map(Number);
                    const d = new Date(year, monthIndex, day, hours, minutes);
                    parsedDate = d.toISOString();
                }
            }

            // --- LÓGICA DE ESTADO ---
            let homeScore = null;
            let awayScore = null;
            let status = 'SCHEDULED';

            const statusText = row.querySelector('.rstd')?.textContent?.toUpperCase() || "";
            const timeText = row.querySelector('.fecha')?.textContent?.toUpperCase() || "";

            if (statusText.includes('APLAZ') || timeText.includes('APLAZ')) {
                status = 'POSTPONED';
            } else if (statusText.includes('SUSP') || timeText.includes('SUSP')) {
                status = 'SUSPENDED';
            } else {
                const markers = row.querySelectorAll('.marker_box');
                if (markers.length >= 2) {
                    const s1 = markers[0].textContent?.trim();
                    const s2 = markers[1].textContent?.trim();
                    if (s1 && s2 && !isNaN(parseInt(s1)) && !isNaN(parseInt(s2))) {
                        homeScore = parseInt(s1);
                        awayScore = parseInt(s2);
                        if (rawDate.includes("'") || rawDate.includes("DES") || statusText.includes("'")) {
                            status = 'LIVE';
                        } else {
                            status = 'FINISHED';
                        }
                    }
                }
            }

            if(homeSlug && awaySlug) {
                results.push({
                    homeTeam: homeSlug, awayTeam: awaySlug, homeScore, awayScore, status,
                    homeLogo, awayLogo,
                    matchUrl: `https://www.resultados-futbol.com/partido/${homeSlug}/${awaySlug}`,
                    season, round, matchDate: parsedDate ? parsedDate : new Date().toISOString()
                });
            }
        });
        return results;
      }, season, round, startYear);

      console.log(`✅ Jornada ${round}: ${matchesData.length} partidos.`);
      for (const m of matchesData) {
        await Match.findOneAndUpdate({ matchUrl: m.matchUrl }, m, { upsert: true, new: true });
      }
    } catch (error) {
      console.error(`❌ Error en Jornada ${round}:`, error);
    } finally {
      try { await browser.close(); } catch(e) {}
    }
  }

  // --- SEED ---
  public async scrapeFullSeason(season: string) {
    if (ScraperService.isSeeding) return;
    ScraperService.isSeeding = true; 
    console.log(`🚀 Iniciando CARGA de la temporada ${season}...`);
    try {
        for (let i = 1; i <= 38; i++) {
            await this.scrapeRound(season, i);
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log("🏁 CARGA COMPLETADA.");
    } catch (e) {
        console.error("Error en carga masiva:", e);
    } finally {
        ScraperService.isSeeding = false; 
    }
  }

  // --- CRON ---
  public async updateLiveMatches() {
    if (ScraperService.isSeeding) return;
    const now = new Date();
    const liveMatch = await Match.findOne({
        matchDate: { 
            $gte: new Date(now.getTime() - 180 * 60000), 
            $lte: new Date(now.getTime() + 10 * 60000) 
        },
        status: { $nin: ['FINISHED', 'POSTPONED', 'SUSPENDED'] } 
    });
    
    if (liveMatch) {
        console.log(`🔥 EN JUEGO: ${liveMatch.homeTeam} vs ${liveMatch.awayTeam}`);
        await this.scrapeRound(liveMatch.season, liveMatch.round);
        await this.scrapeMatchDetail(liveMatch.matchUrl);
    }
  }
}