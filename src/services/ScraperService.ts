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
      headless: 'new', // Invisible
      executablePath: executablePath,
      ignoreHTTPSErrors: true, 
      defaultViewport: null,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--start-maximized',
        '--disable-dev-shm-usage',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
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
        console.log(`🆕 Temporada creada: ${year}`);
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

  // --- SCRAPEO PROFUNDO (Detalle + Marcador + Estado + Minuto Limpio) ---
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
        
        await page.evaluate(async () => {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 1000));
        });

        const details = await page.evaluate(() => {
            // 1. ESTADIO
            let stadium = null;
            const stadiumEl = document.querySelector('li[itemprop="location"] span[itemprop="name"]');
            if (stadiumEl) stadium = stadiumEl.textContent?.replace('Estadio:', '').trim() || null;

            // 2. LÓGICA DE ESTADO Y MINUTO
            const minEl = document.querySelector('.live_min') || document.querySelector('.jor-status');
            const rawText = minEl?.textContent?.trim() || "";
            const upperText = rawText.toUpperCase();

            let computedStatus = 'SCHEDULED';
            let finalMinute = null;

            // Estado
            if (upperText.includes('FIN') || upperText.includes('TERMINADO')) {
                computedStatus = 'FINISHED';
            } else if (upperText.includes("'") || upperText.includes("DES") || upperText.includes("DIRECTO")) {
                computedStatus = 'LIVE';
            } else if (upperText.includes("APLAZ")) {
                computedStatus = 'POSTPONED';
            } else if (upperText.includes("SUSP")) {
                computedStatus = 'SUSPENDED';
            }

            // Minuto (Solo si es LIVE)
            if (computedStatus === 'LIVE') {
                const match = rawText.match(/\((.*?)\)/); 
                if (match) finalMinute = match[1];
                else finalMinute = rawText; 
            }

            // 3. MARCADOR
            let homeScore = null;
            let awayScore = null;
            const markers = document.querySelectorAll('.resultado .marker_box');
            if (markers.length >= 2) {
                homeScore = parseInt(markers[0].textContent?.trim() || "");
                awayScore = parseInt(markers[1].textContent?.trim() || "");
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
                            team = 'home'; minute = cells[1].textContent?.trim() || ""; player = cells[0].textContent?.trim() || ""; 
                        } else if (cells[4].classList.contains('gol')) { 
                            team = 'away'; minute = cells[5].textContent?.trim() || ""; player = cells[6].textContent?.trim() || ""; 
                        }
                        if (minute) events.push({ minute, player, score, team });
                    }
                }
            });

            return { stadium, currentMinute: finalMinute, events, homeScore, awayScore, computedStatus };
        });

        // 👇👇 AQUÍ ESTÁ EL CAMBIO: AÑADIDO EL MARCADOR AL LOG 👇👇
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

  // --- SCRAPEO GENERAL (JORNADA) - CON AJUSTE HORARIO ---
  public async scrapeRound(seasonYear: string, round: number) {
    const url = `https://www.resultados-futbol.com/competicion/primera/${seasonYear}/grupo1/jornada${round}`;
    console.log(`📡 Scrapeando: Temporada ${seasonYear} - Jornada ${round}`);

    const seasonDoc = await this.getOrCreateSeason(seasonYear);
    const browser = await this.launchBrowser();

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      const userAgent = new UserAgent({ deviceCategory: 'desktop', platform: 'MacIntel' });
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

            // --- PARSEO DE FECHA Y HORA (AJUSTE UTC) ---
            let rawDateText = row.querySelector('.fecha')?.textContent?.trim() || "";
            let statusText = row.querySelector('.rstd')?.textContent?.trim() || "";
            
            const cleanDateText = rawDateText.replace(/\s+/g, ' ').toUpperCase();
            const cleanStatusText = statusText.replace(/\s+/g, ' ').toUpperCase();

            // 1. Buscar la hora (21:00)
            const timeMatch = cleanDateText.match(/(\d{1,2}:\d{2})/) || cleanStatusText.match(/(\d{1,2}:\d{2})/);
            const timeStr = timeMatch ? timeMatch[1] : "00:00";

            // 2. Determinar Día/Mes/Año
            // Creamos la fecha directamente en UTC para evitar líos con la hora local del servidor
            let year = startYear;
            let monthIndex = 0;
            let day = 1;
            let dateFound = false;

            const dateRegexMatch = rawDateText.match(/(\d{1,2})\s([A-Z][a-z]{2})/);
            if (dateRegexMatch) {
                day = parseInt(dateRegexMatch[1]);
                const monthStr = dateRegexMatch[2];
                monthIndex = monthMap[monthStr] !== undefined ? monthMap[monthStr] : -1;
                if (monthIndex !== -1) {
                    // Ajuste de año
                    if (monthIndex < 6) year = parseInt(seasonYear);
                    dateFound = true;
                }
            }

            // Si la fecha es relativa (HOY/MAÑANA), usamos la fecha actual como base
            if (!dateFound || cleanDateText.includes("HOY") || cleanDateText.includes("MAÑANA")) {
                const now = new Date();
                year = now.getFullYear();
                monthIndex = now.getMonth();
                day = now.getDate();
                if (cleanDateText.includes("MAÑANA")) day += 1;
                if (cleanDateText.includes("AYER")) day -= 1;
            }

            const [hours, minutes] = timeStr.split(':').map(Number);

            // 3. Construir fecha en UTC con offset de España
            // España es UTC+1 en invierno, UTC+2 en verano.
            // Si restamos ese offset a la hora leída, obtenemos la hora UTC real para Mongo.
            let offset = 1; // Invierno
            if (monthIndex >= 3 && monthIndex <= 9) offset = 2; // Verano (Abril-Oct) aprox

            // Date.UTC crea un timestamp. Al hacer new Date(timestamp), tenemos la fecha absoluta.
            const finalDate = new Date(Date.UTC(year, monthIndex, day, hours - offset, minutes));

            // --- ESTADO ---
            let homeScore = null;
            let awayScore = null;
            let status = 'SCHEDULED';

            if (cleanStatusText.includes('APLAZ') || cleanDateText.includes('APLAZ')) status = 'POSTPONED';
            else if (cleanStatusText.includes('SUSP') || cleanDateText.includes('SUSP')) status = 'SUSPENDED';
            else {
                const markers = row.querySelectorAll('.marker_box');
                if (markers.length >= 2) {
                    const s1 = markers[0].textContent?.trim();
                    const s2 = markers[1].textContent?.trim();
                    if (s1 && s2 && !isNaN(parseInt(s1)) && !isNaN(parseInt(s2))) {
                        homeScore = parseInt(s1);
                        awayScore = parseInt(s2);
                        if (cleanDateText.includes("'") || cleanDateText.includes("DES") || cleanStatusText.includes("'")) status = 'LIVE';
                        else status = 'FINISHED';
                    }
                }
            }

            if(homeSlug && awaySlug) {
                results.push({
                    homeName, awayName, homeSlug, awaySlug, homeLogo, awayLogo,
                    homeScore, awayScore, status, matchUrl: specificUrl,
                    round, 
                    matchDate: finalDate.toISOString(), // <--- FECHA CORREGIDA
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
            homeScore: m.homeScore, awayScore: m.awayScore, status: m.status,
            matchDate: m.matchDate, round: m.round, matchUrl: m.matchUrl,
        };
        if (m.currentMinute && m.status === 'LIVE') updateData.currentMinute = m.currentMinute;

        await Match.findOneAndUpdate(
            { season: seasonDoc._id, homeTeam: homeTeamDoc._id, awayTeam: awayTeamDoc._id }, 
            updateData, 
            { upsert: true, new: true }
        );
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
    }).populate('season'); 
    
    if (liveMatch) {
        const seasonYear = (liveMatch.season as any).year;
        console.log(`🔥 EN JUEGO: ${liveMatch._id}`);
        await this.scrapeRound(seasonYear, liveMatch.round);
        await this.scrapeMatchDetail(liveMatch.matchUrl);
    }
  }
}