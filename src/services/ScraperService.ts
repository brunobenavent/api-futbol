import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// @ts-ignore
import UserAgent from 'user-agents';
import Match from '../models/Match.js';
import Team from '../models/Team.js';
import Season from '../models/Season.js';

(puppeteer as any).use(StealthPlugin());

export class ScraperService {

  public static isSeeding = false;

  private async randomDelay(min: number, max: number) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // --- CONFIGURACIÓN CENTRALIZADA DEL NAVEGADOR ---
  private async launchBrowser() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

    return await (puppeteer as any).launch({ 
      headless: 'new', // Modo invisible para producción
      executablePath: executablePath,
      ignoreHTTPSErrors: true, 
      defaultViewport: null,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--start-maximized',
        '--disable-dev-shm-usage',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security'
      ]
    });
  }

  // --- INYECCIÓN DE EVASIÓN DE FINGERPRINTING ---
  private async injectEvasions(page: any) {
    await page.evaluateOnNewDocument(() => {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return 'Intel Inc.';
            if (parameter === 37446) return 'Intel(R) Iris(R) Xe Graphics';
            return getParameter(parameter);
        };
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en-US', 'en'] });
    });
  }

  // --- ELIMINADOR DE POPUPS ---
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

  // --- HELPERS RELACIONALES ---
  private async getOrCreateSeason(year: string): Promise<any> {
    let season = await Season.findOne({ year });
    if (!season) {
        season = await Season.create({ year, name: `Temporada ${parseInt(year)-1}/${year}` });
    }
    return season;
  }

  private async getOrCreateTeam(name: string, slug: string, logo: string | null): Promise<any> {
    let team = await Team.findOne({ slug });
    if (!team) {
        team = await Team.create({ name, slug, logo });
    } else if (logo && (!team.logo || team.logo.includes('?'))) {
        team.logo = logo;
        await team.save();
    }
    return team;
  }

  // --- SCRAPEO PROFUNDO (Detalle + Marcador + Estado + Minuto Limpio + Anti-Flicker) ---
  public async scrapeMatchDetail(matchUrl: string) {
    console.log(`🔍 Analizando DETALLE COMPLETO: ${matchUrl}`);
    const browser = await this.launchBrowser();

    try {
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        
        await this.injectEvasions(page);
        const userAgent = new UserAgent({ deviceCategory: 'desktop', platform: 'Win32' });
        await page.setUserAgent(userAgent.toString());

        try { await page.goto(matchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) {}
        
        await this.removeCookiesBruteForce(page);
        
        await page.evaluate(async () => {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 1000));
        });

        const details = await page.evaluate(() => {
            // 1. ESTADIO
            let stadium = null;
            const stadiumEl = document.querySelector('li[itemprop="location"] span[itemprop="name"]');
            if (stadiumEl) {
                stadium = stadiumEl.textContent?.replace('Estadio:', '').trim() || null;
            }

            // 2. LÓGICA DE ESTADO Y MINUTO (MEJORADA)
            const minEl = document.querySelector('.live_min') || document.querySelector('.jor-status');
            const rawText = minEl?.textContent?.trim() || "";
            const upperText = rawText.toUpperCase();

            let computedStatus = 'SCHEDULED';
            let finalMinute = null;

            // Calculamos estado basado en el texto
            if (upperText.includes('FIN') || upperText.includes('TERMINADO')) {
                computedStatus = 'FINISHED';
            } else if (upperText.includes("'") || upperText.includes("DES") || upperText.includes("DIRECTO")) {
                computedStatus = 'LIVE';
            } else if (upperText.includes("APLAZ")) {
                computedStatus = 'POSTPONED';
            } else if (upperText.includes("SUSP")) {
                computedStatus = 'SUSPENDED';
            }

            // SOLO guardamos el minuto si está LIVE
            if (computedStatus === 'LIVE') {
                // Si pone "DIRECTO (30')", sacamos el 30'
                const match = rawText.match(/\((.*?)\)/); 
                if (match) finalMinute = match[1];
                else finalMinute = rawText; // Ej: "DES"
            } 

            // 3. MARCADOR
            let homeScore = null;
            let awayScore = null;
            const markers = document.querySelectorAll('.resultado .marker_box');
            if (markers.length >= 2) {
                homeScore = parseInt(markers[0].textContent?.trim() || "");
                awayScore = parseInt(markers[1].textContent?.trim() || "");
                // Si hay goles, aseguramos que no esté en SCHEDULED
                if (!isNaN(homeScore) && !isNaN(awayScore) && computedStatus === 'SCHEDULED') {
                    computedStatus = 'FINISHED'; 
                }
            }

            // 4. EVENTOS
            const events: any[] = [];
            const rows = document.querySelectorAll('.match-header-resume table tbody tr');
            rows.forEach(row => {
                const goalIcon = row.querySelector('.mhr-ico.gol');
                if (goalIcon) {
                    const cells = Array.from(row.querySelectorAll('td'));
                    if (cells.length >= 7) {
                        let minute = "", player = "", team = "", score = cells[3]?.textContent?.trim() || ""; 
                        if (cells[2].classList.contains('gol')) { 
                            team = 'home'; minute = cells[1].textContent?.trim() || ""; player = cells[0].textContent?.trim() || "Local"; 
                        } else if (cells[4].classList.contains('gol')) { 
                            team = 'away'; minute = cells[5].textContent?.trim() || ""; player = cells[6].textContent?.trim() || "Visitante"; 
                        }
                        if (minute) events.push({ minute, player, score, team });
                    }
                }
            });

            return { stadium, currentMinute: finalMinute, events, homeScore, awayScore, computedStatus };
        });

        // --- LÓGICA DE PROTECCIÓN (ANTI-FLICKER) ---
        const currentMatchInDB = await Match.findOne({ matchUrl: matchUrl }).select('status');
        
        if (currentMatchInDB && currentMatchInDB.status === 'LIVE') {
            // Si en BD estaba LIVE, pero el scraper dice SCHEDULED (fallo momentáneo), mantenemos LIVE.
            if (details.computedStatus === 'SCHEDULED') {
                console.log("🛡️ Protección activada: Mantenemos LIVE aunque el scraper no vio tiempo.");
                details.computedStatus = 'LIVE';
            }
        }

        console.log(`📝 Detalles: Estadio="${details.stadium}", Marcador=${details.homeScore}-${details.awayScore}, Minuto="${details.currentMinute}", Estado=${details.computedStatus}`);

        const updateData: any = { 
            stadium: details.stadium,
            currentMinute: details.currentMinute,
            events: details.events,
        };

        if (details.homeScore !== null) updateData.homeScore = details.homeScore;
        if (details.awayScore !== null) updateData.awayScore = details.awayScore;
        if (details.computedStatus !== 'SCHEDULED') updateData.status = details.computedStatus;

        const match = await Match.findOneAndUpdate({ matchUrl: matchUrl }, updateData, { new: true });
        if (match && details.stadium) {
            await Team.findByIdAndUpdate(match.homeTeam, { stadium: details.stadium });
        }

    } catch (error) {
        console.error("❌ Error en detalle:", error);
    } finally {
        try { await browser.close(); } catch(e) {}
    }
  }

  // --- SCRAPEO GENERAL (JORNADA) ---
  public async scrapeRound(seasonYear: string, round: number) {
    const url = `https://www.resultados-futbol.com/competicion/primera/${seasonYear}/grupo1/jornada${round}`;
    console.log(`📡 Scrapeando: Temporada ${seasonYear} - Jornada ${round}`);

    const seasonDoc = await this.getOrCreateSeason(seasonYear);
    const browser = await this.launchBrowser();

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      
      await this.injectEvasions(page);
      const userAgent = new UserAgent({ deviceCategory: 'desktop', platform: 'Win32' });
      await page.setUserAgent(userAgent.toString());
      
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) {}
      await this.removeCookiesBruteForce(page);
      await page.waitForSelector('tr.vevent', { timeout: 20000 });

      const startYear = parseInt(seasonYear) - 1; 

      const matchesData = await page.evaluate((seasonYear: any, round: any, startYear: any) => {
        const rows = document.querySelectorAll('tr.vevent');
        const results: any[] = [];
        const monthMap: Record<string, number> = { 'Ene':0, 'Feb':1, 'Mar':2, 'Abr':3, 'May':4, 'Jun':5, 'Jul':6, 'Ago':7, 'Sep':8, 'Oct':9, 'Nov':10, 'Dic':11 };

        rows.forEach((row) => {
            const homeLink = row.querySelector('.equipo1 a')?.getAttribute('href'); 
            const awayLink = row.querySelector('.equipo2 a')?.getAttribute('href');
            const homeSlug = homeLink ? homeLink.split('/')[2] : null;
            const awaySlug = awayLink ? awayLink.split('/')[2] : null;
            const homeName = row.querySelector('.equipo1')?.textContent?.trim() || homeSlug;
            const awayName = row.querySelector('.equipo2')?.textContent?.trim() || awaySlug;

            let specificUrl = row.querySelector('.rstd a')?.getAttribute('href');
            if (!specificUrl) specificUrl = `https://www.resultados-futbol.com/partido/${homeSlug}/${awaySlug}`;
            else if (!specificUrl.startsWith('http')) specificUrl = `https://www.resultados-futbol.com${specificUrl}`;

            const homeImg = row.querySelector('.equipo1 img');
            const awayImg = row.querySelector('.equipo2 img');
            let homeLogo = homeImg?.getAttribute('data-src') || homeImg?.getAttribute('src') || null;
            let awayLogo = awayImg?.getAttribute('data-src') || awayImg?.getAttribute('src') || null;
            if (homeLogo) homeLogo = homeLogo.split('?')[0];
            if (awayLogo) awayLogo = awayLogo.split('?')[0];

            // Fecha Inteligente (UTC Offset)
            let rawDateText = row.querySelector('.fecha')?.textContent?.trim() || "";
            let statusText = row.querySelector('.rstd')?.textContent?.trim() || "";
            const cleanDateText = rawDateText.replace(/\s+/g, ' ').toUpperCase();
            const cleanStatusText = statusText.replace(/\s+/g, ' ').toUpperCase();

            const timeMatch = cleanDateText.match(/(\d{1,2}:\d{2})/) || cleanStatusText.match(/(\d{1,2}:\d{2})/);
            const timeStr = timeMatch ? timeMatch[1] : "00:00";

            let targetDate = new Date();
            if (cleanDateText.includes("HOY")) { /* es hoy */ } 
            else if (cleanDateText.includes("MAÑANA")) { targetDate.setDate(targetDate.getDate() + 1); } 
            else if (cleanDateText.includes("AYER")) { targetDate.setDate(targetDate.getDate() - 1); } 
            else {
                const dateRegexMatch = rawDateText.match(/(\d{1,2})\s([A-Z][a-z]{2})/);
                if (dateRegexMatch) {
                    const day = parseInt(dateRegexMatch[1]);
                    const monthStr = dateRegexMatch[2];
                    const monthIndex = monthMap[monthStr] !== undefined ? monthMap[monthStr] : -1;
                    if (monthIndex !== -1) {
                        let year = startYear;
                        if (monthIndex < 6) year = parseInt(seasonYear);
                        targetDate = new Date(year, monthIndex, day);
                    }
                }
            }

            const [hours, minutes] = timeStr.split(':').map(Number);
            let offset = 1; 
            const m = targetDate.getMonth();
            if (m >= 3 && m <= 9) offset = 2; 
            const finalDate = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hours - offset, minutes));

            // Algoritmo Jerárquico de Estado
            let homeScore = null;
            let awayScore = null;
            let status = 'SCHEDULED';

            // 1. Aplazado/Suspendido
            if (cleanStatusText.includes('APLAZ') || cleanDateText.includes('APLAZ')) status = 'POSTPONED';
            else if (cleanStatusText.includes('SUSP') || cleanDateText.includes('SUSP')) status = 'SUSPENDED';
            // 2. En Juego (Live)
            else {
                const markers = row.querySelectorAll('.marker_box');
                // Comprobamos primero indicadores claros de live
                const isLiveText = cleanDateText.includes("'") || cleanDateText.includes("DES") || cleanStatusText.includes("'");
                const hasMarkers = markers.length >= 2;

                if (hasMarkers) {
                    const s1 = markers[0].textContent?.trim();
                    const s2 = markers[1].textContent?.trim();
                    if (s1 && s2 && !isNaN(parseInt(s1)) && !isNaN(parseInt(s2))) {
                        homeScore = parseInt(s1);
                        awayScore = parseInt(s2);
                        if (isLiveText) status = 'LIVE';
                        else status = 'FINISHED';
                    }
                }
            }

            if(homeSlug && awaySlug) {
                results.push({
                    homeName, awayName, homeSlug, awaySlug, homeLogo, awayLogo,
                    homeScore, awayScore, status, matchUrl: specificUrl,
                    round, matchDate: finalDate.toISOString(),
                    currentMinute: cleanStatusText 
                });
            }
        });
        return results;
      }, seasonYear, round, startYear);

      console.log(`✅ Jornada ${round}: ${matchesData.length} partidos.`);

      for (const m of matchesData) {
        const homeTeamDoc = await this.getOrCreateTeam(m.homeName, m.homeSlug, m.homeLogo);
        const awayTeamDoc = await this.getOrCreateTeam(m.awayName, m.awaySlug, m.awayLogo);

        await Season.findByIdAndUpdate(seasonDoc._id, {
            $addToSet: { teams: { $each: [homeTeamDoc._id, awayTeamDoc._id] } }
        });

        const updateData: any = {
            season: seasonDoc._id, homeTeam: homeTeamDoc._id, awayTeam: awayTeamDoc._id,
            round: m.round, matchUrl: m.matchUrl
        };
        if (m.matchDate) updateData.matchDate = m.matchDate;
        if (m.homeScore !== null) updateData.homeScore = m.homeScore;
        if (m.awayScore !== null) updateData.awayScore = m.awayScore;
        if (m.status !== 'SCHEDULED') updateData.status = m.status;
        if (m.currentMinute && m.status === 'LIVE') updateData.currentMinute = m.currentMinute;

        await Match.findOneAndUpdate(
            { season: seasonDoc._id, homeTeam: homeTeamDoc._id, awayTeam: awayTeamDoc._id }, 
            { $set: updateData }, 
            { upsert: true, new: true }
        );
      }
    } catch (error) {
      console.error(`❌ Error en Jornada ${round}:`, error);
    } finally {
      try { await browser.close(); } catch(e) {}
    }
  }

  // --- MANTENIMIENTO Y CRON ---
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

  public async updateLiveMatches() {
    if (ScraperService.isSeeding) return;
    const now = new Date();
    const liveMatch = await Match.findOne({
        matchDate: { 
            $gte: new Date(now.getTime() - 180 * 60000), 
            $lte: new Date(now.getTime() + 10 * 60000) 
        },
        status: { $nin: ['FINISHED', 'POSTPONED', 'SUSPENDED'] } 
    }).populate('season'); 
    
    if (liveMatch) {
        const seasonYear = (liveMatch.season as any).year;
        console.log(`🔥 EN JUEGO: ${liveMatch._id}`);
        await this.scrapeRound(seasonYear, liveMatch.round);
        await this.scrapeMatchDetail(liveMatch.matchUrl);
    }
  }
}