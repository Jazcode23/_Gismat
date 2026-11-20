// Casos de prueba CU015 - Validar detección de IA. Navegador real contra el backend real. Guarda resultados-cu015.json
const { chromium } = require('playwright');
const fs = require('fs');
const PASS = process.env.GISMAT_PASS, WEB = 'http://127.0.0.1:3114', API = 'http://127.0.0.1:8000/api';
const resultados = []; let browser;
const dlg = '[role=dialog]';
const must = (c, m) => { if (!c) throw new Error(m); };
const j = async (r) => r.json();

async function login(usuario) {
  const r = await fetch(API + '/auth/login/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, password: PASS }) });
  return (await r.json()).token;
}
async function api(path, token, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: { Authorization: 'Token ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function sesion(usuario) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage(); p.errores = []; p.esri = 0;
  p.on('pageerror', e => p.errores.push(e.message));
  p.on('request', r => { if (r.url().includes('World_Imagery')) p.esri++; });
  p.on('response', async r => { if (r.url().endsWith('/auth/login/') && r.ok()) { try { p.token = (await r.json()).token; } catch {} } });
  await p.goto(WEB + '/'); await p.waitForTimeout(900);
  await p.fill('input[placeholder="usuarioejemplo"]', usuario); await p.fill('input[placeholder="••••••••"]', PASS);
  await p.click('button[type=submit]'); await p.waitForTimeout(2000);
  if (!(await p.locator('button:has-text("Ver detalles"), button:has-text("Validar")').first().isVisible().catch(() => false))) { await p.locator('text=Detecciones IA').first().click().catch(() => {}); }
  await p.waitForSelector('button:has-text("Ver detalles"), button:has-text("Validar")', { timeout: 15000 });
  return p;
}
async function caso(id, titulo, esperado, fn) {
  await cerrar().catch(() => {});
  let obtenido = '', ok = false;
  try { obtenido = await fn(); ok = true; } catch (e) { obtenido = 'FALLA: ' + String(e.message).split('\n')[0]; }
  resultados.push({ id, cu: 'CU015', titulo, esperado, obtenido, resultado: ok ? 'Pasó' : 'Falló' });
  console.log((ok ? 'OK   ' : 'FAIL ') + id + ' ' + titulo + (ok ? '' : '\n       ' + obtenido));
}
let PAGS = [];
async function cerrar() {
  for (const p of PAGS) for (let i = 0; i < 4; i++) {
    const hay = await p.locator(dlg).count(); if (!hay) break;
    const b = p.locator(`${dlg} button[aria-label="Cerrar modal"], ${dlg} button:has-text("Permanecer en IA")`).first();
    if (await b.count()) await b.click().catch(() => {}); else await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
  }
}
const fila = (p, texto) => p.locator(`tbody tr:has-text("${texto}")`);
async function pestana(p, nombre) { await p.locator(`button:has-text("${nombre}")`).first().click(); await p.waitForTimeout(500); }
async function abrir(p, texto) { await pestana(p, 'Todos'); await fila(p, texto).locator('button:has-text("Validar"), button:has-text("Ver detalles")').first().click(); await p.waitForSelector('[data-testid=fecha-captura]'); await p.waitForTimeout(600); }
async function recargar(p) { await pestana(p, 'Confirmados'); await pestana(p, 'Todos'); }

(async () => {
  browser = await chromium.launch();
  // Detecciones nuevas, cargadas por la misma API que usaría el módulo de IA
  const adm0 = await login('admin');
  const nuevas = {};
  for (const [k, lat, lng, area] of [['A', -26.8222, -65.2185, 420], ['B', -26.8350, -65.2010, 150], ['C', -26.8100, -65.2300, 800], ['D', -26.8400, -65.2200, 260], ['E', -26.8000, -65.2400, 90]]) {
    const r = await api('/detecciones-ia/', adm0, 'POST', { latitud: lat, longitud: lng, ubicacion: `Prueba CU015 ${k}`, confianza: 87, area_m2: area, cauce: 'Canal Sur', distancia_curso_m: 70 });
    nuevas[k] = r.data.id || r.data;
  }
  const op = await sesion('operador'), ana = await sesion('analista'); PAGS = [op, ana];
  const tokO = op.token;
  const focos = async () => (await api('/focos/', tokO)).data.length;
  const dets = async (q = '') => (await api('/detecciones-ia/?estado=todos' + q, tokO)).data;
  const det = async (txt) => (await dets()).find(d => d.location === txt);

  await caso('CP-CU015-01', 'Precondición y listado: se listan las detecciones pendientes con ubicación y fecha',
    'En la pestaña "Nuevos" figuran las detecciones preliminares pendientes, con su ubicación sugerida y fecha.',
    async () => {
      await pestana(op, 'Nuevos');
      const n = await op.locator('tbody tr').count(); must(n >= 5, 'pocas filas: ' + n);
      const t = await fila(op, 'Prueba CU015 A').innerText();
      must(/Prueba CU015 A/.test(t) && /\d{4}|\d{2}\/\d{2}/.test(t), 'sin datos de la fila: ' + t.slice(0, 80));
      must(/Nuevo|Pendiente/i.test(t), 'no figura como pendiente: ' + t.replace(/\n/g, ' | ').slice(0, 120));
      await op.screenshot({ path: 'evidencia/CP-CU015-01.png' });
      return `${n} detecciones pendientes listadas; la fila muestra ubicación, fecha y estado "Nuevo / Pendiente IRH".`;
    });

  await caso('CP-CU015-02', 'Paso 3-4: se muestra la imagen satelital y la ubicación sugerida',
    'Al abrir la detección se ve la imagen satelital con la ubicación sugerida marcada.',
    async () => {
      const antes = op.esri;
      await abrir(op, 'Prueba CU015 A');
      await op.waitForTimeout(1200);
      must(await op.locator('[data-testid=mapa-satelital]').isVisible(), 'sin visor satelital');
      must(op.esri > antes, 'no se pidieron teselas de imagen satelital');
      must(await op.locator('[data-testid=mapa-satelital] .leaflet-interactive').count() >= 2, 'sin marca de ubicación / superficie');
      const t = await op.locator(dlg).first().innerText();
      must(/-?26\.8222|26\.8222/.test(t), 'no muestra las coordenadas');
      await op.screenshot({ path: 'evidencia/CP-CU015-02.png' });
      return `Visor satelital con la ubicación sugerida (punto) y la superficie detectada (círculo); ${op.esri - antes} teselas de imagen solicitadas. Coordenadas -26.8222, -65.2185.`;
    });

  await caso('CP-CU015-03', 'Fecha de captura satelital visible',
    'Se informa la fecha de captura satelital de la detección.',
    async () => {
      await abrir(op, 'Prueba CU015 A');
      const t = await op.locator('[data-testid=fecha-captura]').innerText();
      must(/Fecha de captura satelital:\s*\d{2}\/\d{2}\/\d{4}/.test(t), 'sin fecha: ' + t);
      return t.replace(/\n/g, ' ');
    });

  await caso('CP-CU015-04', 'Flujo 5a: ampliar la imagen antes de decidir y volver al paso 5',
    'Se amplía la imagen y se consulta la fecha de captura; al cerrar vuelve la pantalla de decisión con los botones.',
    async () => {
      await abrir(op, 'Prueba CU015 A');
      await op.click('[data-testid=ampliar-imagen]'); await op.waitForSelector('[data-testid=mapa-ampliado]'); await op.waitForTimeout(800);
      const h = await op.locator('[data-testid=mapa-ampliado]').evaluate(e => e.getBoundingClientRect().height);
      const hp = await op.locator('[data-testid=mapa-satelital]').evaluate(e => e.getBoundingClientRect().height);
      must(h > hp * 2, `la imagen ampliada no es más grande (${h} vs ${hp})`);
      const sub = await op.locator('#imagen-ampliada').innerText();
      must(/Fecha de captura satelital: \d{2}\/\d{2}\/\d{4}/.test(sub), 'la vista ampliada no muestra la fecha');
      await op.screenshot({ path: 'evidencia/CP-CU015-04.png' });
      await op.locator('#imagen-ampliada button[aria-label="Cerrar modal"]').click(); await op.waitForTimeout(500);
      must(await op.locator('[data-testid=confirmar-deteccion]').isVisible(), 'no volvió a la decisión');
      return `Imagen ampliada (${Math.round(hp)} px -> ${Math.round(h)} px de alto) con fecha de captura; al cerrar vuelve a CONFIRMAR / DESCARTAR.`;
    });

  await caso('CP-CU015-05', 'Paso 5-6: confirmar incorpora el foco y calcula el IRH',
    'La detección pasa a Confirmada, se crea el foco con IRH calculado y se informa; deja de estar pendiente.',
    async () => {
      const f0 = await focos();
      await abrir(op, 'Prueba CU015 A');
      await op.click('[data-testid=confirmar-deteccion]'); await op.waitForSelector('#success-dialog'); await op.waitForTimeout(700);
      const t = await op.locator('#success-dialog').innerText();
      const m = /IRH ([\d.]+)/.exec(t); must(m, 'el mensaje no informa el IRH real: ' + t.slice(0, 160));
      must(!/0\.84/.test(t) || m[1] === '0.84', 'IRH fijo en el mensaje');
      const d = await det('Prueba CU015 A');
      must(d.statusType === 'confirmado' && d.focoId, 'la detección no quedó confirmada con foco');
      must(Math.abs(d.irh - Number(m[1])) < 0.11, `IRH del mensaje (${m[1]}) distinto al del foco (${d.irh})`);
      must((await focos()) === f0 + 1, 'no se creó un único foco');
      const foco = (await api('/focos/', tokO)).data.find(x => x.id === d.focoId);
      must(foco && foco.estado === 'pendiente' && Number.isFinite(foco.irh), 'foco sin IRH/estado');
      await op.screenshot({ path: 'evidencia/CP-CU015-05.png' });
      await op.click('#success-dialog button:has-text("Permanecer en IA")'); await op.waitForTimeout(400);
      await pestana(op, 'Nuevos');
      must(await fila(op, 'Prueba CU015 A').count() === 0, 'sigue entre las pendientes');
      return `Foco ${d.focoId} creado (estado Pendiente) con IRH ${d.irh} (${d.riesgo}); el mensaje informa el IRH real; la detección ya no figura en "Nuevos".`;
    });

  await caso('CP-CU015-06', 'Confirmada: el foco queda registrado en el ABM de basurales',
    'El foco generado por la detección aparece en Basurales (CU005 disparado).',
    async () => {
      const d = await det('Prueba CU015 A');
      const lista = (await api('/geoportal/focos', tokO)).data;
      must(lista.some(x => x.id === d.focoId), 'el foco no figura en el visor');
      return `El foco ${d.focoId} figura en el visor y en la lista de focos.`;
    });

  await caso('CP-CU015-07', 'Descartar: la detección deja de figurar entre las pendientes y no se crea foco',
    'Se pide confirmación, la detección queda Descartada, sale de "Nuevos" y no se crea ningún foco.',
    async () => {
      const f0 = await focos();
      await abrir(op, 'Prueba CU015 B');
      await op.click('[data-testid=descartar-deteccion]');
      must(/¿Descartar esta detección\?/.test(await op.locator(dlg).first().innerText()), 'no pide confirmación');
      await op.click('[data-testid=confirmar-descarte]'); await op.waitForSelector('[data-testid=aviso-validacion]'); await op.waitForTimeout(500);
      const d = await det('Prueba CU015 B'); must(d.statusType === 'descartado', 'estado ' + d.statusType);
      must((await focos()) === f0, 'se creó un foco');
      await pestana(op, 'Nuevos'); must(await fila(op, 'Prueba CU015 B').count() === 0, 'sigue pendiente');
      await pestana(op, 'Descartados'); must(await fila(op, 'Prueba CU015 B').count() === 1, 'no figura en Descartados');
      await op.screenshot({ path: 'evidencia/CP-CU015-07.png' });
      return 'Pidió confirmación, la detección quedó Descartada (persistido), salió de "Nuevos", figura en "Descartados" y no se creó ningún foco.';
    });

  await caso('CP-CU015-08', 'Descartar: se puede volver atrás sin cambios',
    'Al elegir "Volver" la detección sigue pendiente.',
    async () => {
      await abrir(op, 'Prueba CU015 C');
      await op.click('[data-testid=descartar-deteccion]'); await op.click('button:has-text("VOLVER")'); await op.waitForTimeout(300);
      must(await op.locator('[data-testid=confirmar-deteccion]').isVisible(), 'no volvió a la decisión');
      const d = await det('Prueba CU015 C'); must(d.statusType === 'nuevo', 'cambió a ' + d.statusType);
      return 'Sin cambios: la detección sigue "Nuevo".';
    });

  await caso('CP-CU015-09', 'Flujo 6a: error técnico al confirmar',
    'Se muestra un mensaje de error y la detección permanece pendiente (sin foco creado).',
    async () => {
      const f0 = await focos();
      await abrir(op, 'Prueba CU015 C');
      const h = r => r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"Error interno"}' }) : r.fallback();
      await op.route('**/api/detecciones-ia/*/confirmar/', h);
      try { await op.click('[data-testid=confirmar-deteccion]'); await op.waitForSelector('[data-testid=error-validacion]'); } finally { await op.unroute('**/api/detecciones-ia/*/confirmar/', h); }
      const t = await op.locator('[data-testid=error-validacion]').innerText();
      must(/No se pudo confirmar la detección, intente nuevamente\. La detección permanece pendiente\./.test(t), 'mensaje: ' + t);
      await op.screenshot({ path: 'evidencia/CP-CU015-09.png' });
      const d = await det('Prueba CU015 C'); must(d.statusType === 'nuevo' && !d.focoId, 'cambió el estado');
      must((await focos()) === f0, 'se creó un foco');
      must(await op.locator('[data-testid=confirmar-deteccion]').isEnabled(), 'no se puede reintentar');
      return 'Mensaje de error del caso de uso mostrado; la detección sigue pendiente, sin foco creado, y se puede reintentar.';
    });

  await caso('CP-CU015-10', 'Flujo 6a: tras el error se puede reintentar y la confirmación funciona',
    'Al reintentar sin la falla, la detección se confirma.',
    async () => {
      await abrir(op, 'Prueba CU015 C');
      await op.click('[data-testid=confirmar-deteccion]'); await op.waitForSelector('#success-dialog');
      const d = await det('Prueba CU015 C'); must(d.statusType === 'confirmado' && d.focoId, 'no se confirmó');
      return `Reintento exitoso: foco ${d.focoId}, IRH ${d.irh}.`;
    });

  await caso('CP-CU015-11', 'Una detección ya resuelta no puede volver a validarse',
    'Al abrir una detección confirmada o descartada no se ofrecen los botones y se indica su estado.',
    async () => {
      await abrir(op, 'Prueba CU015 A');
      must(await op.locator('[data-testid=confirmar-deteccion]').count() === 0, 'ofrece confirmar');
      must(/ya fue confirmada/.test(await op.locator('[data-testid=deteccion-resuelta]').innerText()), 'sin aviso');
      await op.locator(`${dlg} button[aria-label="Cerrar modal"]`).first().click(); await op.waitForTimeout(300);
      await abrir(op, 'Prueba CU015 B');
      must(/fue descartada/.test(await op.locator('[data-testid=deteccion-resuelta]').innerText()), 'sin aviso de descartada');
      const r = await api(`/detecciones-ia/${(await det('Prueba CU015 B')).id}/confirmar/`, tokO, 'POST', {});
      must(r.status === 400, 'la API permitió confirmar una descartada: ' + r.status);
      return 'Sin botones; la API rechaza confirmar una descartada (400).';
    });

  await caso('CP-CU015-12', 'Rol Analista también puede validar; Supervisor solo consulta',
    'El analista confirma; el supervisor ve la detección pero no puede confirmar ni descartar (UI y API 403).',
    async () => {
      await abrir(ana, 'Prueba CU015 D');
      must(await ana.locator('[data-testid=confirmar-deteccion]').isVisible(), 'el analista no ve CONFIRMAR');
      await ana.locator(`${dlg} button[aria-label="Cerrar modal"]`).first().click();
      const sup = await sesion('supervisor'); PAGS.push(sup);
      await abrir(sup, 'Prueba CU015 D');
      must(await sup.locator('[data-testid=confirmar-deteccion]').count() === 0, 'el supervisor ve CONFIRMAR');
      must(await sup.locator('[data-testid=solo-consulta]').isVisible(), 'sin aviso de solo consulta');
      const id = (await det('Prueba CU015 D')).id;
      must((await api(`/detecciones-ia/${id}/confirmar/`, sup.token, 'POST', {})).status === 403, 'confirmar no dio 403');
      must((await api(`/detecciones-ia/${id}/descartar/`, sup.token, 'POST', {})).status === 403, 'descartar no dio 403');
      must((await det('Prueba CU015 D')).statusType === 'nuevo', 'cambió el estado');
      return 'Analista: puede validar. Supervisor: consulta; confirmar/descartar -> 403 y sin cambios.';
    });


  await caso('CP-CU015-13', 'La pestaña "Nuevos" explica que sirve para confirmar o descartar',
    'En "Nuevos" se indica que son pendientes de validación y que cada una se confirma o se descarta; la fila ofrece "Validar".',
    async () => {
      await pestana(op, 'Nuevos');
      const t = await op.locator('[data-testid=ayuda-nuevos]').innerText();
      must(/pendientes de validación/i.test(t) && /confirmala/i.test(t) && /descartala/i.test(t), 'texto de ayuda incompleto: ' + t.slice(0, 120));
      must(await op.locator('tbody tr button:has-text("Validar")').count() > 0, 'las filas pendientes no ofrecen "Validar"');
      await pestana(op, 'Confirmados');
      must(await op.locator('[data-testid=ayuda-nuevos]').count() === 0, 'la ayuda aparece en otra pestaña');
      await pestana(op, 'Nuevos');
      await op.screenshot({ path: 'evidencia/CP-CU015-13.png' });
      return 'Banner "Nuevos = pendientes de validación" con las acciones confirmar / descartar; botón "Validar" en cada fila pendiente; la ayuda solo aparece en "Nuevos".';
    });

  await caso('CP-CU015-14', 'Procesar nuevas imágenes: el módulo de IA (simulado) genera detecciones preliminares pendientes',
    'Se muestra el avance del análisis, se generan detecciones nuevas marcadas como SIMULADO y quedan en "Nuevos" para validar.',
    async () => {
      const antes = (await dets()).filter(d => d.statusType === 'nuevo').length;
      await op.click('[data-testid=procesar-imagenes]');
      await op.waitForSelector('[data-testid=analisis-ia]');
      must(/Sentinel-2/.test(await op.locator('[data-testid=analisis-ia]').innerText()), 'sin pasos del análisis');
      await op.screenshot({ path: 'evidencia/CP-CU015-14a.png' });
      await op.waitForSelector('[data-testid=analisis-resultado]', { timeout: 20000 });
      const t = await op.locator('[data-testid=analisis-resultado]').innerText();
      const n = Number((/generó (\d+)/.exec(t) || [])[1]); must(n >= 3, 'no informa detecciones generadas: ' + t);
      await op.screenshot({ path: 'evidencia/CP-CU015-14b.png' });
      const despues = (await dets()).filter(d => d.statusType === 'nuevo');
      must(despues.length === antes + n, `pendientes ${antes} -> ${despues.length}, esperado +${n}`);
      const nuevas = despues.filter(d => d.location.startsWith('Zona analizada'));
      must(nuevas.length >= n && nuevas.every(d => d.origen === 'simulado'), 'las detecciones no figuran como simuladas');
      await op.click('[data-testid=revisar-pendientes]'); await op.waitForTimeout(600);
      must(await op.locator('[data-testid=ayuda-nuevos]').isVisible(), 'no pasó a la pestaña Nuevos');
      must(await op.locator('tbody tr:has-text("Zona analizada")').first().innerText().then(x => /SIMULADO/i.test(x)), 'la fila no dice SIMULADO');
      return `El análisis generó ${n} detecciones preliminares (pendientes ${antes} -> ${despues.length}), todas marcadas SIMULADO; "Revisar pendientes" lleva a la pestaña Nuevos.`;
    });

  await caso('CP-CU015-15', 'Las detecciones generadas por el análisis se pueden validar (confirmar y descartar)',
    'Una generada se confirma (crea foco con IRH) y otra se descarta.',
    async () => {
      const gen = (await dets()).filter(d => d.location.startsWith('Zona analizada') && d.statusType === 'nuevo');
      must(gen.length >= 2, 'faltan detecciones generadas');
      const [a, b] = gen; const f0 = await focos();
      await pestana(op, 'Todos');
      await fila(op, a.id).locator('button:has-text("Validar")').click(); await op.waitForSelector('[data-testid=confirmar-deteccion]');
      await op.click('[data-testid=confirmar-deteccion]'); await op.waitForSelector('#success-dialog');
      await op.click('#success-dialog button:has-text("Permanecer en IA")'); await op.waitForTimeout(400);
      await fila(op, b.id).locator('button:has-text("Validar")').click(); await op.waitForSelector('[data-testid=descartar-deteccion]');
      await op.click('[data-testid=descartar-deteccion]'); await op.click('[data-testid=confirmar-descarte]'); await op.waitForSelector('[data-testid=aviso-validacion]');
      const da = (await dets()).find(d => d.id === a.id), db = (await dets()).find(d => d.id === b.id);
      must(da.statusType === 'confirmado' && da.focoId && Number.isFinite(da.irh), 'la primera no quedó confirmada con IRH');
      must(db.statusType === 'descartado', 'la segunda no quedó descartada');
      must((await focos()) === f0 + 1, 'cantidad de focos incorrecta');
      return `${a.id} confirmada -> foco ${da.focoId} (IRH ${da.irh}); ${b.id} descartada; se creó un solo foco.`;
    });

  await caso('CP-CU015-16', 'El supervisor no puede ejecutar el análisis',
    'El botón "Procesar Nuevas Imágenes" está deshabilitado y la API responde 403.',
    async () => {
      const sup = await sesion('supervisor'); PAGS.push(sup);
      must(await sup.locator('[data-testid=procesar-imagenes]').isDisabled(), 'el botón está habilitado');
      must((await api('/detecciones-ia/analizar/', sup.token, 'POST', {})).status === 403, 'la API no respondió 403');
      return 'Botón deshabilitado; API: 403.';
    });

  const errs = PAGS.flatMap(p => p.errores);
  await caso('CP-CU015-17', 'Sin errores de ejecución en la aplicación', 'No se registran excepciones en el navegador.', async () => { must(errs.length === 0, errs.join(' | ')); return 'Sin excepciones.'; });

  fs.writeFileSync('resultados-cu015.json', JSON.stringify(resultados, null, 2));
  const f = resultados.filter(r => r.resultado !== 'Pasó').length;
  console.log(`\n${resultados.length} casos · ${resultados.length - f} pasaron · ${f} fallaron`);
  await browser.close();
})();
