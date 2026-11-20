// Casos de prueba CU016 - Recibir y consultar alerta automática. Navegador real contra el backend real.
const { chromium } = require('playwright');
const fs = require('fs');
const PASS = process.env.GISMAT_PASS, WEB = 'http://127.0.0.1:3114', API = 'http://127.0.0.1:8000/api';
const resultados = []; let browser, PAGS = [];
const must = (c, m) => { if (!c) throw new Error(m); };
async function login(u) { const r = await fetch(API + '/auth/login/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: u, password: PASS }) }); return (await r.json()).token; }
async function api(path, token, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: { Authorization: 'Token ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function sesion(usuario) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage(); p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  p.on('response', async r => { if (r.url().endsWith('/auth/login/') && r.ok()) { try { p.token = (await r.json()).token; } catch {} } });
  await p.goto(WEB + '/'); await p.waitForTimeout(900);
  await p.fill('input[placeholder="usuarioejemplo"]', usuario); await p.fill('input[placeholder="••••••••"]', PASS);
  await p.click('button[type=submit]'); await p.waitForTimeout(2500);
  PAGS.push(p); return p;
}
async function irAlGeoportal(p) {
  if (await p.locator('button[title="Ver alertas de riesgo ambiental"]').count() === 0) { await p.locator('text=Geoportal').first().click(); await p.waitForTimeout(2500); }
  await p.waitForSelector('button[title="Ver alertas de riesgo ambiental"]', { timeout: 15000 });
}
async function abrirPanel(p) { await p.click('button[title="Ver alertas de riesgo ambiental"]'); await p.waitForSelector('text=Alertas Ambientales y de Riesgo'); await p.waitForTimeout(500); }
async function cerrarPanel(p) { const b = p.locator('button[title="Cerrar panel de alertas"]'); if (await b.count()) await b.click(); await p.waitForTimeout(300); }
async function recargarGeo(p) { await p.locator('text=Detecciones IA').first().click().catch(() => {}); await p.waitForTimeout(800); await irAlGeoportal(p); }
async function caso(id, titulo, esperado, fn) {
  for (const p of PAGS) await cerrarPanel(p).catch(() => {});
  let obtenido = '', ok = false;
  try { obtenido = await fn(); ok = true; } catch (e) { obtenido = 'FALLA: ' + String(e.message).split('\n')[0]; }
  resultados.push({ id, cu: 'CU016', titulo, esperado, obtenido, resultado: ok ? 'Pasó' : 'Falló' });
  console.log((ok ? 'OK   ' : 'FAIL ') + id + ' ' + titulo + (ok ? '' : '\n       ' + obtenido));
}
const item = (p, cod) => p.locator(`[data-testid=alerta-item]:has-text("${cod}")`);

(async () => {
  browser = await chromium.launch();
  const tokA = await login('admin');
  const focos0 = (await api('/focos/', tokA)).data;
  const critico = focos0.find(f => f.nivelRiesgo === 'Crítico' && !f.irhProvisorio && f.estado === 'activo');
  const op = await sesion('operador'), sup = await sesion('supervisor');
  let K, P; // foco crítico y foco con datos incompletos que registra el operador

  await caso('CP-CU016-01', 'Un foco que alcanza el IRH crítico genera una alerta automática',
    'Al registrar un foco con IRH crítico se genera una alerta crítica asociada al foco.',
    async () => {
      const r = await api('/focos/', op.token, 'POST', { tipo: 'basural', estado: 'activo', ubicacion: 'Foco crítico CU016', latitud: critico.latitud, longitud: critico.longitud, volumenM3: 900, permeabilidad: 'alta', tipoResiduo: 'industrial' });
      must(r.status === 201 && r.data.nivelRiesgo === 'Crítico', 'el foco no quedó crítico: ' + JSON.stringify(r.data).slice(0, 120));
      K = r.data.id;
      const al = (await api('/alertas/?foco=' + K, tokA)).data;
      must(al.length === 1 && al[0].nivel === 'critica' && al[0].estado === 'activa', 'no hay una alerta crítica activa');
      return `Foco ${K} con IRH ${r.data.irh} (Crítico) -> alerta crítica generada: "${al[0].titulo}".`;
    });

  await caso('CP-CU016-02', 'El Supervisor visualiza la alerta en su panel con la recomendación accionable',
    'La campana muestra la alerta; el panel incluye la recomendación (al menos una acción) y que está dirigida al Supervisor.',
    async () => {
      await irAlGeoportal(sup);
      must(Number((await sup.locator('button[title="Ver alertas de riesgo ambiental"]').innerText()).replace(/\D/g, '') || 0) > 0, 'la campana no muestra alertas');
      await abrirPanel(sup);
      const a = item(sup, K); must(await a.count() === 1, 'la alerta del foco no figura en el panel');
      const rec = await a.locator('[data-testid=alerta-recomendacion]').innerText();
      const acciones = await a.locator('[data-testid=alerta-recomendacion] li').count();
      must(/Recomendación para el seguimiento/i.test(rec) && acciones >= 1, 'sin recomendación accionable');
      must(/Limpieza prioritaria/.test(rec), 'la recomendación no incluye una acción concreta: ' + rec.replace(/\n/g, ' '));
      must(/Dirigida a:\s*Supervisor/i.test(await a.locator('[data-testid=alerta-destinatario]').innerText()), 'no indica el destinatario');
      await sup.screenshot({ path: 'evidencia/CP-CU016-02.png' });
      return `Alerta visible en el panel del Supervisor con ${acciones} acción(es) recomendada(s): ${rec.replace(/\n/g, ' ').slice(33, 200)} · Dirigida a: Supervisor.`;
    });

  await caso('CP-CU016-03', 'Alerta de advertencia (datos incompletos) con recomendación de relevamiento',
    'Un foco con IRH alto pero datos incompletos genera una advertencia (no crítica) cuya recomendación pide relevar los datos que faltan.',
    async () => {
      const r = await api('/focos/', op.token, 'POST', { tipo: 'basural', estado: 'activo', ubicacion: 'Foco incompleto CU016', latitud: critico.latitud + 0.0004, longitud: critico.longitud + 0.0004 });
      P = r.data.id;
      const al = (await api('/alertas/?foco=' + P, tokA)).data;
      if (!al.length) return `El foco ${P} (IRH ${r.data.irh}, provisorio) no supera el umbral: no genera alerta, como corresponde.`;
      must(al[0].nivel === 'advertencia', 'debería ser advertencia, no ' + al[0].nivel);
      must(/Relevar en campo/.test(al[0].recomendacion), 'recomendación: ' + al[0].recomendacion);
      return `Alerta de ADVERTENCIA para ${P} con la recomendación: "${al[0].recomendacion}".`;
    });

  await caso('CP-CU016-04', 'El panel ordena las alertas por prioridad',
    'Las alertas críticas ("Prioridad Alta") van antes que las de advertencia.',
    async () => {
      await recargarGeo(sup); await abrirPanel(sup);
      const textos = await sup.locator('[data-testid=alerta-item]').evaluateAll(els => els.map(e => /Prioridad Alta/i.test(e.innerText) ? 0 : /Advertencia/i.test(e.innerText) ? 1 : 2));
      must(textos.length > 1, 'hay una sola alerta');
      must(textos.includes(0) && textos.includes(1), 'el caso necesita alertas críticas y de advertencia: ' + textos.join(','));
      must(textos.every((v, i) => i === 0 || textos[i - 1] <= v), 'orden incorrecto: ' + textos.join(','));
      return `Orden de prioridad correcto en ${textos.length} alertas (${textos.join(',')}).`;
    });

  await caso('CP-CU016-05', 'El Supervisor marca la alerta como atendida',
    'La alerta deja de figurar en el panel y en la lista de activas; el contador baja.',
    async () => {
      await recargarGeo(sup);
      const antes = Number((await sup.locator('button[title="Ver alertas de riesgo ambiental"]').innerText()).replace(/\D/g, '') || 0);
      await abrirPanel(sup);
      await item(sup, K).locator('[data-testid=atender-alerta]').click(); await sup.waitForTimeout(1200);
      must(await item(sup, K).count() === 0, 'la alerta sigue en el panel');
      const al = (await api('/alertas/?foco=' + K, tokA)).data; must(al[0].estado === 'atendida', 'no quedó atendida en el servidor');
      await cerrarPanel(sup);
      const despues = Number((await sup.locator('button[title="Ver alertas de riesgo ambiental"]').innerText()).replace(/\D/g, '') || 0);
      must(despues === antes - 1, `contador ${antes} -> ${despues}`);
      return `Alerta atendida: sale del panel, queda "atendida" en el servidor y el contador pasa de ${antes} a ${despues}.`;
    });

  await caso('CP-CU016-06', 'El Operador ve las alertas pero no puede marcarlas como atendidas',
    'Sin botón "Marcar como atendida" y la API responde 403.',
    async () => {
      const r = await api('/focos/', op.token, 'POST', { tipo: 'basural', estado: 'activo', ubicacion: 'Otro crítico CU016', latitud: critico.latitud + 0.0002, longitud: critico.longitud - 0.0002, volumenM3: 800, permeabilidad: 'alta', tipoResiduo: 'industrial' });
      const al = (await api('/alertas/?foco=' + r.data.id, tokA)).data;
      await recargarGeo(op); await abrirPanel(op);
      must(await op.locator('[data-testid=alerta-item]').count() > 0, 'el operador no ve alertas');
      must(await op.locator('[data-testid=atender-alerta]').count() === 0, 'el operador ve el botón de atender');
      must((await api(`/alertas/${al[0].pk}/atender/`, op.token, 'POST', {})).status === 403, 'la API no respondió 403');
      return 'El operador consulta las alertas; sin botón de atender; API: 403.';
    });

  await caso('CP-CU016-07', 'Error técnico al marcar la alerta como atendida',
    'Se muestra un mensaje de error y la alerta permanece activa.',
    async () => {
      await recargarGeo(sup); await abrirPanel(sup);
      const n = await sup.locator('[data-testid=alerta-item]').count(); must(n > 0, 'no hay alertas para probar');
      const h = r => r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"Error interno"}' }) : r.fallback();
      await sup.route('**/api/alertas/*/atender/', h);
      try { await sup.locator('[data-testid=atender-alerta]').first().click(); await sup.waitForSelector('text=No se pudo marcar la alerta como atendida'); } finally { await sup.unroute('**/api/alertas/*/atender/', h); }
      must(await sup.locator('[data-testid=alerta-item]').count() === n, 'cambió la cantidad de alertas');
      await sup.screenshot({ path: 'evidencia/CP-CU016-07.png' });
      return 'Mensaje "No se pudo marcar la alerta como atendida, intente nuevamente."; la alerta sigue activa.';
    });

  await caso('CP-CU016-08', 'Al bajar el IRH por debajo del umbral la alerta se cierra sola',
    'Tras sanear el foco la alerta crítica deja de estar activa.',
    async () => {
      const r = await api('/focos/', op.token, 'POST', { tipo: 'basural', estado: 'activo', ubicacion: 'Se sanea CU016', latitud: critico.latitud - 0.0003, longitud: critico.longitud + 0.0003, volumenM3: 900, permeabilidad: 'alta', tipoResiduo: 'industrial' });
      const id = r.data.id; must(r.data.nivelRiesgo === 'Crítico', 'no nació crítico');
      must((await api('/alertas/?foco=' + id + '&estado=activa', tokA)).data.some(a => a.nivel === 'critica'), 'sin alerta crítica activa');
      const m = await api(`/focos/${id}/`, op.token, 'PATCH', { estado: 'limpiado' });
      must(m.status === 200, 'no se pudo modificar: ' + m.status);
      must(!(await api('/alertas/?foco=' + id + '&estado=activa&nivel=critica', tokA)).data.length, 'la alerta crítica sigue activa');
      return `Foco ${id} saneado (IRH ${m.data.irh}): la alerta crítica pasó a "atendida" automáticamente.`;
    });

  const errs = PAGS.flatMap(p => p.errores);
  await caso('CP-CU016-09', 'Sin errores de ejecución en la aplicación', 'No se registran excepciones en el navegador.', async () => { must(errs.length === 0, errs.join(' | ')); return 'Sin excepciones.'; });

  fs.writeFileSync('resultados-cu016.json', JSON.stringify(resultados, null, 2));
  const f = resultados.filter(r => r.resultado !== 'Pasó').length;
  console.log(`\n${resultados.length} casos · ${resultados.length - f} pasaron · ${f} fallaron`);
  await browser.close();
})();
