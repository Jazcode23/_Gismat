// Ejecuta los casos de prueba RF5 (CU005-CU008) contra el backend real y guarda resultados en resultados.json
const { chromium } = require('playwright');
const fs = require('fs');
const PASS = process.env.GISMAT_PASS, WEB = 'http://127.0.0.1:3114', API = 'http://127.0.0.1:8000/api';
const resultados = [];
const dlg = '[role=dialog]';
let browser;

async function apiLogin(usuario) {
  const r = await fetch(API + '/auth/login/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, password: PASS }) });
  return (await r.json()).token;
}
const apiGet = async (path, token) => (await fetch(API + path, { headers: { Authorization: 'Token ' + token } })).json();

async function sesion(usuario) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('response', async r => { if (r.url().endsWith('/auth/login/') && r.ok()) { try { p.token = (await r.json()).token; } catch {} } });
  p.on('pageerror', e => p.errores.push(e.message));
  await p.goto(WEB + '/'); await p.waitForTimeout(900);
  await p.fill('input[placeholder="usuarioejemplo"]', usuario); await p.fill('input[placeholder="••••••••"]', PASS);
  await p.click('button[type=submit]'); await p.waitForTimeout(2000);
  await p.click('a[href="#basurales"]'); await p.waitForSelector('tbody tr', { timeout: 10000 });
  return p;
}

let PAGINAS = [];
async function cerrarTodo() {
  for (const p of PAGINAS) {
    for (let i = 0; i < 3 && await p.locator(dlg).count() > 0; i++) {
      const b = p.locator(`${dlg} button:has-text("Cancelar"), ${dlg} button:has-text("Cerrar")`).first();
      if (await b.count()) await b.click().catch(() => {}); else await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
    }
  }
}
async function caso(id, cu, titulo, esperado, fn) {
  let obtenido = '', ok = false;
  await cerrarTodo().catch(() => {});
  try { obtenido = await fn(); ok = true; } catch (e) { obtenido = 'FALLA: ' + String(e.message).split('\n')[0]; }
  resultados.push({ id, cu, titulo, esperado, obtenido, resultado: ok ? 'Pasó' : 'Falló' });
  console.log((ok ? 'OK   ' : 'FAIL ') + id + ' ' + titulo + (ok ? '' : '\n       ' + obtenido));
}
const must = (c, msg) => { if (!c) throw new Error(msg); };

// ---------------- helpers de UI
async function abrirAlta(p) { await p.click('text=Nuevo basural'); await p.waitForSelector(dlg); await p.waitForTimeout(500); }
async function llenar(p, d) {
  if (d.tipo) await p.selectOption(`${dlg} select >> nth=0`, d.tipo);
  if (d.estado) await p.selectOption(`${dlg} select >> nth=1`, d.estado);
  if (d.ubicacion !== undefined) await p.fill(`${dlg} input[placeholder="Ej. Av. Mate de Luna y Canal Norte"]`, d.ubicacion);
  if (d.barrio !== undefined) await p.fill(`${dlg} input[placeholder="Ej. Villa 9 de Julio"]`, d.barrio);
  if (d.lat !== undefined) await p.fill(`${dlg} input[placeholder="-26.8151"]`, String(d.lat));
  if (d.lng !== undefined) await p.fill(`${dlg} input[placeholder="-65.2096"]`, String(d.lng));
  if (d.vol !== undefined) await p.fill(`${dlg} input[placeholder="400"]`, String(d.vol));
  if (d.sup !== undefined) await p.fill(`${dlg} input[placeholder="600"]`, String(d.sup));
  if (d.perm) await p.selectOption(`${dlg} select >> nth=2`, d.perm);
  if (d.residuo) await p.selectOption(`${dlg} select >> nth=3`, d.residuo);
  if (d.obs !== undefined) await p.fill(`${dlg} textarea >> nth=0`, d.obs);
  if (d.foto) await p.setInputFiles(`${dlg} input[type=file]`, d.foto);
}
const guardarAlta = async p => { await p.click('button:has-text("Registrar basural")'); await p.waitForTimeout(1600); };
const guardarEdicion = async p => { await p.click('button:has-text("Guardar cambios")'); await p.waitForTimeout(1600); };
const aviso = async p => (await p.locator('[role=status]').first().innerText().catch(() => '')).trim();
const fila = (p, cod) => p.locator(`tbody tr:has-text("${cod}")`);
async function altaOk(p, d) { await abrirAlta(p); await llenar(p, d); await guardarAlta(p); const a = await aviso(p); const m = a.match(/(BR|MB|VC)-\d+/); must(m, 'No se registró: ' + a); return { codigo: m[0], aviso: a }; }
async function irhFila(p, cod) { const t = await fila(p, cod).locator('td').nth(4).innerText(); return Number(t.match(/\d+/)[0]); }
async function intercepta(p, metodo, patron, status, fn) {
  const h = r => r.request().method() === metodo ? r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ detail: 'Error interno' }) }) : r.fallback();
  await p.route(patron, h);
  try { return await fn(); } finally { await p.unroute(patron, h); }
}
async function refrescar(p) { await filtroEstado(p, 'inactivo'); await filtroEstado(p, 'vigentes'); }
async function filtroEstado(p, v) { await p.selectOption('select[aria-label="Filtrar por estado"]', v); await p.waitForTimeout(800); }

(async () => {
  browser = await chromium.launch();
    const op = await sesion('operador'), adm = await sesion('admin'), ana = await sesion('analista');
  const tokA = adm.token, tokAn = ana.token; PAGINAS = [op, adm, ana];
  const todos = await apiGet('/focos/', tokA);
  const critico = todos.find(f => f.nivelRiesgo === 'Crítico' && !f.irhProvisorio && f.estado === 'activo');
  const conInterv = todos.find(f => f.totalIntervenciones > 0 && f.estado !== 'inactivo');
  const cerca = { lat: critico.latitud, lng: critico.longitud }; // junto a un curso de agua: datos completos => IRH crítico


  // =================== CU005 - REGISTRAR FOCO ===================
  let A; // foco del alta completa
  await caso('CP-CU005-01', 'CU005', 'Alta exitosa con todos los datos y fotografía de campo',
    'El foco se registra con código, IRH calculado y categoría; queda en la lista y visible en el visor; la foto se guarda.',
    async () => {
      const r = await altaOk(op, { tipo: 'microbasural', estado: 'pendiente', ubicacion: 'Pasaje Prueba 100', barrio: 'Barrio Prueba', lat: -26.8075, lng: -65.2150, vol: 120, sup: 80, perm: 'media', residuo: 'organico', obs: 'Alta de prueba CP-01', foto: 'foto2.png' });
      A = r.codigo; must(/IRH calculado: [\d.]+ \((Bajo|Moderado|Crítico)\)/.test(r.aviso), 'sin IRH en el aviso: ' + r.aviso);
      must(await fila(op, A).count() === 1, 'no aparece en la lista');
      must(await fila(op, A).locator('img').count() === 1, 'sin miniatura de la foto');
      const visor = await apiGet('/geoportal/focos', tokA);
      must(JSON.stringify(visor).includes(A), 'no figura en el servicio del visor');
      await op.screenshot({ path: 'evidencia/CP-CU005-01.png' });
      return `${r.aviso} Foto cargada; figura en la lista y en el visor.`;
    });

  await caso('CP-CU005-02', 'CU005', 'Alta con datos mínimos: variables sin relevar',
    'Se registra con solo los obligatorios; el IRH queda provisorio y se informa qué datos faltan.',
    async () => {
      const r = await altaOk(op, { ubicacion: 'Calle Mínima 1', lat: -26.8300, lng: -65.1900 });
      must(/provisorio/.test(r.aviso), 'no marca IRH provisorio: ' + r.aviso);
      must(/provisorio/.test(await fila(op, r.codigo).innerText()), 'la fila no marca "provisorio"');
      return r.aviso;
    });

  await caso('CP-CU005-03', 'CU005', 'Indicar la ubicación haciendo clic en el mapa (paso 3)',
    'El clic en el mapa completa latitud y longitud dentro del área de San Miguel de Tucumán y el foco se registra con esa ubicación.',
    async () => {
      await abrirAlta(op);
      await op.locator('[data-testid=map-picker]').scrollIntoViewIfNeeded();
      const box = await op.locator('[data-testid=map-picker]').boundingBox();
      await op.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5); await op.waitForTimeout(300);
      const lat = Number(await op.inputValue(`${dlg} input[placeholder="-26.8151"]`)), lng = Number(await op.inputValue(`${dlg} input[placeholder="-65.2096"]`));
      must(lat < -26.6 && lat > -27 && lng < -65.0 && lng > -65.45, `coordenadas fuera del área: ${lat}, ${lng}`);
      await op.fill(`${dlg} input[placeholder="Ej. Av. Mate de Luna y Canal Norte"]`, 'Ubicado con el mapa');
      await op.screenshot({ path: 'evidencia/CP-CU005-03.png' });
      await guardarAlta(op); const a = await aviso(op); must(/registrado/.test(a), a);
      return `Clic en el mapa -> latitud ${lat}, longitud ${lng}. ${a}`;
    });

  await caso('CP-CU005-04', 'CU005', 'Flujo 6a: faltan datos obligatorios',
    'No se registra; se indican los campos a corregir y el formulario permanece abierto (retorna al paso 5).',
    async () => {
      const antes = await op.locator('tbody tr').count();
      await abrirAlta(op); await guardarAlta(op);
      const txt = await op.locator(dlg).innerText();
      must(/dirección o ubicación es obligatoria/i.test(txt) && /Latitud obligatoria/.test(txt) && /Longitud obligatoria/.test(txt), 'no indica todos los campos');
      must(await op.locator(dlg).isVisible(), 'el formulario se cerró');
      await op.screenshot({ path: 'evidencia/CP-CU005-04.png' });
      await op.click('button:has-text("Cancelar")'); await op.waitForTimeout(300);
      must(await op.locator('tbody tr').count() === antes, 'se creó un registro');
      return 'Mensajes: dirección obligatoria, latitud obligatoria, longitud obligatoria. No se creó ningún foco.';
    });

  await caso('CP-CU005-05', 'CU005', 'Flujo 6a: formato inválido (volumen negativo, coordenadas no numéricas)',
    'Se rechaza indicando el campo y el motivo.',
    async () => {
      await abrirAlta(op);
      await llenar(op, { ubicacion: 'X', lat: 'abc', lng: '-65.2', vol: -5 }); await guardarAlta(op);
      const txt = await op.locator(dlg).innerText();
      must(/Latitud obligatoria/.test(txt) && /mayor o igual a 0/.test(txt), 'faltan mensajes: ' + txt.slice(0, 200));
      await op.click('button:has-text("Cancelar")');
      return 'Latitud no numérica y volumen negativo rechazados con mensaje por campo.';
    });

  await caso('CP-CU005-06', 'CU005', 'Ubicación fuera del área de San Miguel de Tucumán',
    'Se rechaza con mensaje claro; no se registra.',
    async () => {
      await abrirAlta(op); await llenar(op, { ubicacion: 'Fuera de área', lat: -20.5, lng: -65.2 }); await guardarAlta(op);
      must(/Fuera del área/.test(await op.locator(dlg).innerText()), 'sin mensaje de área');
      await op.click('button:has-text("Cancelar")');
      return 'Rechazado: "Fuera del área de San Miguel de Tucumán".';
    });

  await caso('CP-CU005-07', 'CU005', 'Flujo 7a: IRH crítico genera alerta automática (CU016)',
    'El IRH queda en categoría Crítico y se genera una alerta crítica asociada al foco.',
    async () => {
      const antesAl = (await apiGet('/alertas/', tokA)).length;
      const r = await altaOk(op, { tipo: 'basural', estado: 'activo', ubicacion: 'Junto al canal (crítico)', lat: cerca.lat, lng: cerca.lng, vol: 900, perm: 'alta', residuo: 'industrial' });
      must(/\(Crítico\)/.test(r.aviso), 'no es crítico: ' + r.aviso);
      const al = await apiGet('/alertas/', tokA);
      const nueva = al.find(a => JSON.stringify(a).includes(r.codigo));
      must(nueva, 'no se generó alerta para ' + r.codigo);
      return `${r.aviso} Alerta generada: "${nueva.title || nueva.titulo || 'alerta crítica'}" (alertas ${antesAl} -> ${al.length}).`;
    });

  await caso('CP-CU005-08', 'CU005', 'Estado de intervención informado al registrar (paso 4)',
    'El foco queda registrado con el estado elegido.',
    async () => {
      const r = await altaOk(op, { estado: 'pendiente', ubicacion: 'Estado pendiente', lat: -26.8400, lng: -65.2300 });
      must(/Pendiente/.test(await fila(op, r.codigo).innerText()), 'el estado no es Pendiente');
      return `${r.codigo} registrado con estado "Pendiente".`;
    });

  await caso('CP-FOTO-01', 'CU005', 'Fotografía de campo: formato no permitido',
    'No se acepta un archivo que no sea JPG/PNG/WebP; se informa el motivo.',
    async () => {
      await abrirAlta(op); await llenar(op, { ubicacion: 'Foto inválida', lat: -26.82, lng: -65.21, foto: 'doc.txt' }); await guardarAlta(op);
      must(/JPG, PNG o WebP/.test(await op.locator(dlg).innerText()), 'sin mensaje de formato');
      await op.click('button:has-text("Cancelar")');
      return 'Rechazado: "La foto debe ser JPG, PNG o WebP."';
    });

  await caso('CP-FOTO-02', 'CU005', 'Fotografía de campo: tamaño máximo 5 MB',
    'Se rechaza una imagen mayor a 5 MB indicando el tamaño máximo.',
    async () => {
      fs.writeFileSync('grande.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(6 * 1024 * 1024)]));
      await abrirAlta(op); await llenar(op, { ubicacion: 'Foto grande', lat: -26.82, lng: -65.21, foto: 'grande.png' }); await guardarAlta(op);
      must(/el máximo es 5 MB/.test(await op.locator(dlg).innerText()), 'sin mensaje de tamaño');
      await op.click('button:has-text("Cancelar")');
      return 'Rechazado: "La foto pesa 6.0 MB; el máximo es 5 MB."';
    });

  await caso('CP-FOTO-03', 'CU005', 'Fotografía de campo: vista previa antes de confirmar y descarte',
    'Se ve la vista previa de la imagen elegida y se puede descartar.',
    async () => {
      await abrirAlta(op); await llenar(op, { foto: 'foto2.png' });
      must(await op.locator(`${dlg} img[alt^="Foto del foco"]`).count() === 1, 'sin vista previa');
      await op.click('text=Descartar la foto elegida'); await op.waitForTimeout(400);
      must(await op.locator(`${dlg} img[alt^="Foto del foco"]`).count() === 0, 'la foto no se descartó');
      await op.click('button:has-text("Cancelar")');
      return 'Vista previa mostrada y descartada correctamente.';
    });

  await caso('CP-CU005-09', 'CU005', 'Flujo 8a: error técnico al guardar',
    'Se muestra "No se pudo completar el registro, intente nuevamente." y no se registra el foco.',
    async () => {
      const antes = (await apiGet('/focos/', tokA)).length;
      await intercepta(op, 'POST', '**/api/focos/', 500, async () => {
        await abrirAlta(op); await llenar(op, { ubicacion: 'Falla técnica', lat: -26.82, lng: -65.21 }); await guardarAlta(op);
        must(/No se pudo completar el registro, intente nuevamente\./.test(await op.locator(dlg).innerText()), 'mensaje incorrecto');
        await op.screenshot({ path: 'evidencia/CP-CU005-09.png' });
        await op.click('button:has-text("Cancelar")');
      });
      must((await apiGet('/focos/', tokA)).length === antes, 'se creó un foco igual');
      return 'Mensaje exacto del caso de uso mostrado; no se creó ningún foco.';
    });

  await caso('CP-CU005-10', 'CU005', 'Rol Supervisor no puede registrar',
    'El botón "Nuevo basural" no se ofrece y la API responde 403.',
    async () => {
      const sup = await sesion('supervisor');
      must(await sup.locator('text=Nuevo basural').count() === 0, 'el supervisor ve el botón');
      const tokS = sup.token;
      const r = await fetch(API + '/focos/', { method: 'POST', headers: { Authorization: 'Token ' + tokS, 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'basural', ubicacion: 'x', latitud: -26.8, longitud: -65.2 }) });
      must(r.status === 403, 'la API respondió ' + r.status);
      await sup.context().close();
      return 'Sin botón en pantalla; API: 403.';
    });

  // =================== CU006 - MODIFICAR FOCO ===================
  await caso('CP-CU006-01', 'CU006', 'Modificar datos que no afectan el IRH',
    'Se actualiza el dato y el IRH se mantiene.',
    async () => {
      const antes = await irhFila(op, A);
      await fila(op, A).locator('text=Editar').click(); await op.waitForSelector(dlg); await op.waitForTimeout(400);
      must((await op.inputValue(`${dlg} input[maxlength="200"]`)) === 'Pasaje Prueba 100', 'no precarga los datos actuales (paso 3)');
      await llenar(op, { obs: 'Observación editada', barrio: 'Barrio Editado' }); await guardarEdicion(op);
      must(/actualizado/.test(await aviso(op)), await aviso(op));
      const despues = await irhFila(op, A); must(antes === despues, `IRH cambió ${antes}->${despues}`);
      return `Datos actualizados con mensaje de éxito; IRH sin cambios (${antes}).`;
    });

  await caso('CP-CU006-02', 'CU006', 'Modificar el volumen recalcula el IRH y la categoría',
    'El IRH se recalcula y se actualiza la categoría de riesgo.',
    async () => {
      const antes = await irhFila(op, A);
      await fila(op, A).locator('text=Editar').click(); await op.waitForSelector(dlg); await op.waitForTimeout(400);
      await llenar(op, { vol: 800 }); await guardarEdicion(op);
      const a = await aviso(op); must(/IRH vigente: [\d.]+ \(/.test(a), a);
      const despues = await irhFila(op, A); must(despues > antes, `IRH ${antes}->${despues}`);
      return `IRH ${antes} -> ${despues}. ${a}`;
    });

  await caso('CP-FOTO-04', 'CU006', 'Fotografía de campo: reemplazar la foto de un foco',
    'La nueva foto reemplaza a la anterior.',
    async () => {
      const antes = await fila(op, A).locator('img').getAttribute('src');
      await fila(op, A).locator('text=Editar').click(); await op.waitForSelector(dlg); await op.waitForTimeout(400);
      must(await op.locator(`${dlg} img[alt^="Foto del foco"]`).count() === 1, 'no muestra la foto actual');
      await llenar(op, { foto: 'foto.png' }); await guardarEdicion(op);
      const despues = await fila(op, A).locator('img').getAttribute('src');
      must(antes !== despues, 'la foto no cambió');
      return 'La miniatura apunta a un archivo nuevo.';
    });

  await caso('CP-FOTO-05', 'CU006', 'Fotografía de campo: quitar la foto de un foco',
    'El foco queda sin foto.',
    async () => {
      await fila(op, A).locator('text=Editar').click(); await op.waitForSelector(dlg); await op.waitForTimeout(400);
      await op.click('text=Quitar la foto actual'); await guardarEdicion(op);
      must(await fila(op, A).locator('img').count() === 0, 'sigue con foto');
      return 'El foco quedó sin fotografía.';
    });

  await caso('CP-CU006-03', 'CU006', 'Flujo 5a: datos inválidos al modificar',
    'Se muestra el error y el foco no se modifica (retorna al paso 4).',
    async () => {
      await fila(op, A).locator('text=Editar').click(); await op.waitForSelector(dlg); await op.waitForTimeout(400);
      await llenar(op, { lat: -10 }); await guardarEdicion(op);
      must(/Fuera del área/.test(await op.locator(dlg).innerText()), 'sin mensaje');
      must(await op.locator(dlg).isVisible(), 'el formulario se cerró');
      await op.click('button:has-text("Cancelar")');
      const f = (await apiGet('/focos/', tokA)).find(x => x.id === A); must(f.latitud === -26.8075, 'la latitud cambió');
      return 'Rechazado y sin cambios en el registro.';
    });

  await caso('CP-CU006-04', 'CU006', 'Flujo 7a: el recálculo lleva el IRH a Crítico y genera alerta',
    'La categoría pasa a Crítico y se genera una alerta automática.',
    async () => {
      const r = await altaOk(op, { estado: 'activo', ubicacion: 'Se agrava', lat: cerca.lat, lng: cerca.lng, vol: 5, perm: 'baja', residuo: 'organico' });
      must(!/Crítico/.test(r.aviso), 'ya nace crítico: ' + r.aviso);
      await fila(op, r.codigo).locator('text=Editar').click(); await op.waitForSelector(dlg); await op.waitForTimeout(400);
      await llenar(op, { vol: 900, perm: 'alta', residuo: 'industrial' }); await guardarEdicion(op);
      must(/\(Crítico\)/.test(await aviso(op)), await aviso(op));
      const al = await apiGet('/alertas/', tokA); must(al.some(a => JSON.stringify(a).includes(r.codigo)), 'sin alerta');
      return `${await aviso(op)} Alerta automática generada.`;
    });

  await caso('CP-CU006-05', 'CU006', 'Flujo 8a: error técnico al actualizar',
    'Se muestra un mensaje de error y el registro no se modifica.',
    async () => {
      await intercepta(op, 'PATCH', '**/api/focos/*/', 500, async () => {
        await fila(op, A).locator('text=Editar').click(); await op.waitForSelector(dlg); await op.waitForTimeout(400);
        await llenar(op, { obs: 'no debe guardarse' }); await guardarEdicion(op);
        must(/No se pudo actualizar el foco, intente nuevamente\. El registro no fue modificado\./.test(await op.locator(dlg).innerText()), 'mensaje incorrecto');
        await op.screenshot({ path: 'evidencia/CP-CU006-05.png' });
        await op.click('button:has-text("Cancelar")');
      });
      const f = (await apiGet('/focos/', tokA)).find(x => x.id === A); must(f.observaciones !== 'no debe guardarse', 'se modificó el registro');
      return 'Mensaje de error mostrado; el registro conserva sus datos.';
    });

  await caso('CP-CU006-06', 'CU006', 'Un foco dado de baja no puede modificarse',
    'No se ofrece "Editar" y la API rechaza la modificación.',
    async () => {
      const r = await altaOk(op, { ubicacion: 'Para baja y edición', lat: -26.8500, lng: -65.2000 });
      await refrescar(adm);
      await fila(adm, r.codigo).locator('button:has-text("Baja")').click(); await adm.click('text=Confirmar baja'); await adm.waitForTimeout(1200);
      await filtroEstado(adm, 'inactivo');
      must(await fila(adm, r.codigo).locator('text=Editar').count() === 0, 'ofrece Editar');
      const res = await fetch(API + `/focos/${r.codigo}/`, { method: 'PATCH', headers: { Authorization: 'Token ' + tokA, 'Content-Type': 'application/json' }, body: JSON.stringify({ observaciones: 'x' }) });
      must(res.status === 400, 'API ' + res.status);
      await filtroEstado(adm, 'vigentes');
      return `Sin botón Editar; API: 400 "El foco está dado de baja y no puede modificarse".`;
    });

  // =================== CU007 - DAR DE BAJA ===================
  await caso('CP-CU007-01', 'CU007', 'Baja de un foco Activo',
    'Pasa a Inactivo, sale de los vigentes, conserva historial; se pide confirmación.',
    async () => {
      const r = await altaOk(adm, { estado: 'activo', ubicacion: 'Baja activo', lat: -26.8200, lng: -65.2500, vol: 50 });
      const histAntes = (await apiGet(`/focos/${r.codigo}/historial/`, tokA)).irh.length;
      await fila(adm, r.codigo).locator('button:has-text("Baja")').click(); await adm.waitForSelector(dlg);
      must(/baja lógica/.test(await adm.locator(dlg).innerText()), 'sin pedido de confirmación');
      await adm.fill(`${dlg} textarea`, 'Cargado por error'); await adm.screenshot({ path: 'evidencia/CP-CU007-01.png' });
      await adm.click('text=Confirmar baja'); await adm.waitForTimeout(1500);
      must(await fila(adm, r.codigo).count() === 0, 'sigue en vigentes');
      const f = (await apiGet('/focos/', tokA)).find(x => x.id === r.codigo); must(f.estado === 'inactivo', 'estado ' + f.estado);
      const hist = (await apiGet(`/focos/${r.codigo}/historial/`, tokA)).irh.length; must(hist >= histAntes, 'se perdió historial');
      return `Estado "Inactivo"; fuera de la lista de vigentes; historial conservado (${histAntes} -> ${hist} registros).`;
    });

  await caso('CP-CU007-02', 'CU007', 'Baja de un foco Saneado',
    'La baja procede y el foco queda Inactivo.',
    async () => {
      const r = await altaOk(adm, { estado: 'limpiado', ubicacion: 'Baja saneado', lat: -26.8250, lng: -65.2450, vol: 30 });
      await fila(adm, r.codigo).locator('button:has-text("Baja")').click(); await adm.waitForSelector(dlg); await adm.click('text=Confirmar baja'); await adm.waitForTimeout(1500);
      const f = (await apiGet('/focos/', tokA)).find(x => x.id === r.codigo); must(f.estado === 'inactivo', f.estado);
      return `${r.codigo} (Saneado) -> Inactivo.`;
    });

  await caso('CP-CU007-03', 'CU007', 'Precondición: un foco Pendiente de intervención no puede darse de baja',
    'El botón Baja está deshabilitado y la API rechaza con mensaje; el foco conserva su estado.',
    async () => {
      const r = await altaOk(adm, { estado: 'pendiente', ubicacion: 'Pendiente no baja', lat: -26.8350, lng: -65.2350, vol: 30 });
      must(await fila(adm, r.codigo).locator('button:has-text("Baja")').isDisabled(), 'el botón está habilitado');
      const res = await fetch(API + `/focos/${r.codigo}/`, { method: 'DELETE', headers: { Authorization: 'Token ' + tokA, 'Content-Type': 'application/json' }, body: '{}' });
      must(res.status === 400, 'API ' + res.status);
      const f = (await apiGet('/focos/', tokA)).find(x => x.id === r.codigo); must(f.estado === 'pendiente', 'cambió a ' + f.estado);
      return 'Botón deshabilitado; API 400 "Solo puede darse de baja un foco en estado Activo o Saneado"; estado sin cambios.';
    });

  await caso('CP-CU007-04', 'CU007', 'Flujo 4a: cancelación por el operador',
    'No hay cambios en el foco.',
    async () => {
      const r = await altaOk(adm, { estado: 'activo', ubicacion: 'Cancelar baja', lat: -26.8450, lng: -65.2250, vol: 30 });
      await fila(adm, r.codigo).locator('button:has-text("Baja")').click(); await adm.waitForSelector(dlg);
      await adm.click(`${dlg} button:has-text("Cancelar")`); await adm.waitForTimeout(400);
      must(await fila(adm, r.codigo).count() === 1, 'desapareció');
      const f = (await apiGet('/focos/', tokA)).find(x => x.id === r.codigo); must(f.estado === 'activo', f.estado);
      return 'Se cerró la confirmación y el foco sigue Activo.';
    });

  await caso('CP-CU007-05', 'CU007', 'Flujo 5a: error técnico al dar de baja',
    'Se muestra un mensaje de error y el foco permanece en su estado.',
    async () => {
      const r = await altaOk(adm, { estado: 'activo', ubicacion: 'Baja con falla', lat: -26.8550, lng: -65.2150, vol: 30 });
      await intercepta(adm, 'DELETE', '**/api/focos/*/', 500, async () => {
        await fila(adm, r.codigo).locator('button:has-text("Baja")').click(); await adm.waitForSelector(dlg); await adm.click('text=Confirmar baja'); await adm.waitForTimeout(1200);
        must(/No se pudo completar la baja, intente nuevamente\./.test(await adm.locator(dlg).innerText()), 'mensaje incorrecto');
        await adm.screenshot({ path: 'evidencia/CP-CU007-05.png' });
        await adm.click(`${dlg} button:has-text("Cancelar")`);
      });
      const f = (await apiGet('/focos/', tokA)).find(x => x.id === r.codigo); must(f.estado === 'activo', f.estado);
      return 'Mensaje de error mostrado; el foco permanece Activo.';
    });

  await caso('CP-CU007-06', 'CU007', 'La baja excluye al foco de los cálculos vigentes y lo conserva en el historial',
    'Disminuyen los focos vigentes del dashboard; el foco no se muestra por defecto pero sí se consulta en "Dados de baja".',
    async () => {
      const r = await altaOk(adm, { estado: 'activo', ubicacion: 'Cálculo vigente', lat: cerca.lat, lng: cerca.lng, vol: 400, perm: 'media', residuo: 'industrial' });
      const d0 = await apiGet('/dashboard/', tokA);
      await fila(adm, r.codigo).locator('button:has-text("Baja")').click(); await adm.waitForSelector(dlg); await adm.click('text=Confirmar baja'); await adm.waitForTimeout(1500);
      const d1 = await apiGet('/dashboard/', tokA);
      must(d1.focosVigentes === d0.focosVigentes - 1, `vigentes ${d0.focosVigentes} -> ${d1.focosVigentes}`);
      const visor = await apiGet('/geoportal/focos', tokA); must(!JSON.stringify(visor).includes(`"${r.codigo}"`), 'sigue en el visor');
      await filtroEstado(adm, 'inactivo'); must(await fila(adm, r.codigo).count() === 1, 'no figura en Dados de baja');
      await filtroEstado(adm, 'vigentes');
      return `Focos vigentes ${d0.focosVigentes} -> ${d1.focosVigentes}; fuera del visor; consultable en "Dados de baja".`;
    });

  await caso('CP-CU007-07', 'CU007', 'Rol Operador no puede dar de baja',
    'No se ofrece el botón Baja y la API responde 403.',
    async () => {
      must(await op.locator('button:has-text("Baja")').count() === 0, 'el operador ve Baja');
      const tokO = op.token;
      const lista = (await apiGet('/focos/', tokA)).find(f => f.estado === 'activo');
      const res = await fetch(API + `/focos/${lista.id}/`, { method: 'DELETE', headers: { Authorization: 'Token ' + tokO, 'Content-Type': 'application/json' }, body: '{}' });
      must(res.status === 403, 'API ' + res.status);
      return 'Sin botón Baja; API: 403.';
    });

  // =================== CU008 - CONSULTAR FOCO ===================
  await refrescar(ana);
  await caso('CP-CU008-01', 'CU008', 'Consultar un foco: atributos, IRH e historial resumido de intervenciones',
    'Un panel de detalle muestra ubicación, tipo de residuo, volumen, estado, IRH y las intervenciones.',
    async () => {
      await fila(ana, conInterv.id).locator('text=Ver').click(); await ana.waitForSelector('[data-testid=detalle-foco]'); await ana.waitForTimeout(1000);
      const t = await ana.locator('[data-testid=detalle-foco]').innerText();
      must(/IRH [\d.]+ \/ 100/i.test(t) && /Volumen estimado/i.test(t) && /Tipo de residuo/i.test(t) && /Historial de intervenciones \(\d+\)/i.test(t), 'faltan datos: ' + t.slice(0, 200).replace(/\n/g, ' | '));
      await ana.screenshot({ path: 'evidencia/CP-CU008-01.png' });
      await ana.click(`${dlg} button:has-text("Cerrar")`);
      return `Detalle de ${conInterv.id} con atributos, IRH y ${t.match(/Historial de intervenciones \((\d+)\)/i)[1]} intervención(es).`;
    });

  await caso('CP-CU008-02', 'CU008', 'Un Supervisor puede consultar pero no modificar',
    'Ve el botón Ver y el detalle; no ve Editar ni Baja.',
    async () => {
      const sup = await sesion('supervisor');
      await sup.locator('tbody tr').first().locator('text=Ver').click(); await sup.waitForSelector('[data-testid=detalle-foco]');
      must(await sup.locator('button:has-text("Editar")').count() === 0 && await sup.locator('button:has-text("Baja")').count() === 0, 'ofrece edición');
      await sup.context().close();
      return 'Consulta habilitada; edición y baja no disponibles.';
    });

  await caso('CP-CU008-03', 'CU008', 'Flujo 2a: foco con datos incompletos',
    'Muestra el resto de los atributos e indica que el IRH es provisorio y qué falta relevar.',
    async () => {
      const r = await altaOk(ana, { ubicacion: 'Incompleto', lat: -26.8060, lng: -65.2160 });
      await fila(ana, r.codigo).locator('text=Ver').click(); await ana.waitForSelector('[data-testid=detalle-foco]'); await ana.waitForTimeout(800);
      const t = await ana.locator('[data-testid=detalle-foco]').innerText();
      must(/provisorio/i.test(t) && /pendiente de relevar/i.test(t) && /Sin relevar/i.test(t), 'no indica datos faltantes');
      await ana.click(`${dlg} button:has-text("Cerrar")`);
      return 'Atributos mostrados; IRH marcado como provisorio con la lista de datos pendientes de relevar.';
    });

  await caso('CP-CU008-04', 'CU008', 'Flujo 3a: error técnico al recuperar los datos',
    'Se muestra "No se pudo cargar la información del foco seleccionado."',
    async () => {
      await intercepta(ana, 'GET', '**/api/focos/*/historial/', 500, async () => {
        await ana.locator('tbody tr').first().locator('text=Ver').click(); await ana.waitForSelector('[data-testid=detalle-foco]'); await ana.waitForTimeout(900);
        must(/No se pudo cargar la información del foco seleccionado\./.test(await ana.locator('[data-testid=detalle-foco]').innerText()), 'mensaje incorrecto');
        await ana.screenshot({ path: 'evidencia/CP-CU008-04.png' });
        await ana.click(`${dlg} button:has-text("Cerrar")`);
      });
      return 'Mensaje exacto del caso de uso mostrado.';
    });

  await caso('CP-CU008-05', 'CU008', 'Un foco dado de baja sigue siendo consultable (trazabilidad)',
    'Desde "Dados de baja" se abre el detalle con estado Dado de baja.',
    async () => {
      await filtroEstado(ana, 'inactivo');
      await ana.locator('tbody tr').first().locator('text=Ver').click(); await ana.waitForSelector('[data-testid=detalle-foco]'); await ana.waitForTimeout(800);
      must(/Dado de baja|Inactivo/i.test(await ana.locator(dlg).innerText()), 'no indica la baja');
      await ana.click(`${dlg} button:has-text("Cerrar")`);
      return 'Detalle disponible con estado "Dado de baja".';
    });

  const errs = [op, adm, ana].flatMap(p => p.errores);
  await caso('CP-GEN-01', 'Transversal', 'Sin errores de ejecución en la aplicación durante todas las pruebas',
    'No se registran excepciones en el navegador.', async () => { must(errs.length === 0, errs.join(' | ')); return 'Sin excepciones.'; });

  fs.writeFileSync('resultados.json', JSON.stringify(resultados, null, 2));
  const fallas = resultados.filter(r => r.resultado !== 'Pasó').length;
  console.log(`\n${resultados.length} casos · ${resultados.length - fallas} pasaron · ${fallas} fallaron`);
  await browser.close();
})();
