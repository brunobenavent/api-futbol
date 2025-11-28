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

  // --- CONFIGURACIÓN NAVEGADOR ANTI-HUELLA ---
  private async launchBrowser() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    
    return await (puppeteer as any).launch({ 
      headless: 'new',
      executablePath: executablePath,
      ignoreHTTPSErrors: true, 
      defaultViewport: null,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--start-maximized',
        '--disable-dev-shm-usage',
        '--disable-features=IsolateOrigins,site-per-process',
        // Nuevos flags anti-detección básicos
        '--disable-blink-features=AutomationControlled', 
        '--disable-web-security'
      ]
    });
  }

  // --- INYECCIÓN DE EVASIÓN DE FINGERPRINTING ---
  // Esta función inyecta código JS antes de cargar la página para mentir sobre la GPU y el Hardware
  private async injectEvasions(page: any) {
    await page.evaluateOnNewDocument(() => {
        // 1. Spoofing de WebGL (Tarjeta Gráfica)
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            // Si preguntan por el Vendor (Fabricante), decimos Intel
            if (parameter === 37445) return 'Intel Inc.';
            // Si preguntan por el Renderer (Modelo), decimos una gráfica común
            if (parameter === 37446) return 'Intel(R) Iris(R) Xe Graphics';
            return getParameter(parameter);
        };

        // 2. Spoofing de Hardware Concurrency (Núcleos CPU)
        // Los servidores Docker suelen tener pocos núcleos, mentimos diciendo que tenemos 8
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            get: () => 8,
        });

        // 3. Spoofing de Idiomas (Para parecer español nativo)
        Object.defineProperty(navigator, 'languages', {
            get: () => ['es-ES', 'es', 'en-US', 'en'],
        });
    });
  }

  private async removeCookiesBruteForce(page: any) {
    try {
        await page.evaluate(() => {
            const selectorList = ['#qc-cmp2-container', '.qc-cmp2-container', '#didomi-host', '.fc-consent-root', '.cookie-banner', '#login_rf', '.generic_dialog', '#betAgeConfirm2', '#betBlur'];
            selectorList.forEach(sel => { const el = document.querySelector(sel); if (el) el.remove(); });
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

  // --- SCRAPEO PROFUNDO ---
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

        // --- 🛡️ GUARDIÁN DE COMPETICIÓN 🛡️ ---
        // Verificamos si la web nos ha redirigido a otra competición (ej: Supercopa)
        const competitionCheck = await page.evaluate(() => {
            // Buscamos el texto del segundo enlace del menú de migas (crumbs)
            // Estructura típica: Ligas > Primera División > Partido...
            const crumb = document.querySelector('#crumbs li:nth-child(2) a')?.textContent?.trim();
            return crumb || "";
        });

        // Si estamos en una competición que NO es Primera, abortamos y marcamos como Aplazado.
        // (Ajusta "Primera División" si tu liga se llama diferente en la web)
        if (competitionCheck && !competitionCheck.includes('Primera División')) {
            console.warn(`⚠️ ALERTA: Redirección detectada a "${competitionCheck}". Este partido no es de Liga.`);
            
            // Forzamos estado APLAZADO y salimos para no guardar datos falsos
            await Match.findOneAndUpdate(
                { matchUrl: matchUrl },
                { status: 'POSTPONED', stadium: null, homeScore: null, awayScore: null }
            );
            return; // <--- STOP AQUÍ
        }

        // --- SI PASA EL FILTRO, SEGUIMOS NORMAL ---

        const details = await page.evaluate(() => {
            // 1. ESTADIO
            let stadium = null;
            const stadiumEl = document.querySelector('li[itemprop="location"] span[itemprop="name"]');
            if (stadiumEl) {
                stadium = stadiumEl.textContent?.replace('Estadio:', '').trim() || null;
            }

            // 2. MINUTO / ESTADO
            let currentMinute = null;
            const minEl = document.querySelector('.live_min') || document.querySelector('.jor-status');
            if (minEl) currentMinute = minEl.textContent?.trim();

            let computedStatus = 'SCHEDULED';
            if (currentMinute) {
                const txt = currentMinute.toUpperCase();
                if (txt.includes('FIN') || txt.includes('TERMINADO')) computedStatus = 'FINISHED';
                else if (txt.includes("'") || txt.includes("DES") || txt.includes("DIRECTO")) computedStatus = 'LIVE';
                else if (txt.includes("APLAZ")) computedStatus = 'POSTPONED';
                else if (txt.includes("SUSP")) computedStatus = 'SUSPENDED';
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
                            team = 'home';
                            minute = cells[1].textContent?.trim() || "";
                            player = cells[0].textContent?.trim() || "Local";
                        } else if (cells[4].classList.contains('gol')) { 
                            team = 'away';
                            minute = cells[5].textContent?.trim() || "";
                            player = cells[6].textContent?.trim() || "Visitante";
                        }
                        if (minute) events.push({ minute, player, score, team });
                    }
                }
            });
            return { stadium, currentMinute, events, homeScore, awayScore, computedStatus };
        });

        console.log(`📝 Detalles: Estadio="${details.stadium}", Marcador=${details.homeScore}-${details.awayScore}, Estado=${details.computedStatus}`);

        const updateData: any = { 
            stadium: details.stadium,
            currentMinute: details.currentMinute,
            events: details.events,
        };

        if (details.homeScore !== null) updateData.homeScore = details.homeScore;
        if (details.awayScore !== null) updateData.awayScore = details.awayScore;
        
        // Solo actualizamos estado si no estaba ya en POSTPONED por el guardián (aunque aquí ya habríamos salido)
        if (details.computedStatus !== 'SCHEDULED') updateData.status = details.computedStatus;

        const match = await Match.findOneAndUpdate({ matchUrl: matchUrl }, updateData, { new: true });

        // Solo actualizamos el estadio del equipo SI NO ES NULL (para no borrarlo si el partido falla)
        if (match && details.stadium) {
            await Team.findByIdAndUpdate(match.homeTeam, { stadium: details.stadium });
        }

    } catch (error) {
        console.error("❌ Error en detalle:", error);
    } finally {
        try { await browser.close(); } catch(e) {}
    }
  }

  // --- SCRAPEO GENERAL ---
  public async scrapeRound(seasonYear: string, round: number) {
    const url = `https://www.resultados-futbol.com/competicion/primera/${seasonYear}/grupo1/jornada${round}`;
    console.log(`📡 Scrapeando: Temporada ${seasonYear} - Jornada ${round}`);
    const seasonDoc = await this.getOrCreateSeason(seasonYear);
    const browser = await this.launchBrowser();

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      
      // INYECTAMOS EVASIÓN TAMBIÉN AQUÍ
      await this.injectEvasions(page);
      
      const userAgent = new UserAgent({ deviceCategory: 'desktop', platform: 'Win32' });
      await page.setUserAgent(userAgent.toString());
      
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) {}
      await this.removeCookiesBruteForce(page);
      await page.waitForSelector('tr.vevent', { timeout: 20000 });

      const startYear = parseInt(seasonYear) - 1; 
      const matchesData = await page.evaluate((seasonYear: any, round: any, startYear: any) => {
        // ... (Mismo código de extracción de antes) ...
        // Para no alargar la respuesta, mantén el mismo bloque 'page.evaluate' que ya tenías funcionando perfecto
        // La lógica de extracción no cambia, solo la protección anti-bot.
        
        const rows = document.querySelectorAll('tr.vevent');
        const results: any[] = [];
        const monthMap: Record<string, number> = { 'Ene':0, 'Feb':1, 'Mar':2, 'Abr':3, 'May':4, 'Jun':5, 'Jul':6, 'Ago':7, 'Sep':8, 'Oct':9, 'Nov':10, 'Dic':11 };

        rows.forEach((row) => {
            // ... Copia aquí tu lógica de extracción de la versión anterior ...
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
                    if (monthIndex < 6) year = parseInt(seasonYear);
                    const [hours, minutes] = timeStr.split(':').map(Number);
                    const d = new Date(year, monthIndex, day, hours, minutes);
                    parsedDate = d.toISOString();
                }
            }

            let homeScore = null;
            let awayScore = null;
            let status = 'SCHEDULED';
            const statusText = row.querySelector('.rstd')?.textContent?.toUpperCase() || "";
            const timeText = row.querySelector('.fecha')?.textContent?.toUpperCase() || "";

            if (statusText.includes('APLAZ') || timeText.includes('APLAZ')) status = 'POSTPONED';
            else if (statusText.includes('SUSP') || timeText.includes('SUSP')) status = 'SUSPENDED';
            else {
                const markers = row.querySelectorAll('.marker_box');
                if (markers.length >= 2) {
                    const s1 = markers[0].textContent?.trim();
                    const s2 = markers[1].textContent?.trim();
                    if (s1 && s2 && !isNaN(parseInt(s1)) && !isNaN(parseInt(s2))) {
                        homeScore = parseInt(s1);
                        awayScore = parseInt(s2);
                        if (rawDate.includes("'") || rawDate.includes("DES") || statusText.includes("'")) status = 'LIVE';
                        else status = 'FINISHED';
                    }
                }
            }

            if(homeSlug && awaySlug) {
                results.push({
                    homeName, awayName, homeSlug, awaySlug, homeLogo, awayLogo,
                    homeScore, awayScore, status, matchUrl: specificUrl,
                    round, matchDate: parsedDate ? parsedDate : new Date().toISOString()
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

        await Match.findOneAndUpdate(
            { season: seasonDoc._id, homeTeam: homeTeamDoc._id, awayTeam: awayTeamDoc._id }, 
            {
                season: seasonDoc._id, homeTeam: homeTeamDoc._id, awayTeam: awayTeamDoc._id,
                homeScore: m.homeScore, awayScore: m.awayScore, status: m.status,
                matchDate: m.matchDate, round: m.round, matchUrl: m.matchUrl,
            }, 
            { upsert: true, new: true }
        );
      }
    } catch (error) {
      console.error(`❌ Error en Jornada ${round}:`, error);
    } finally {
      try { await browser.close(); } catch(e) {}
    }
  }

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