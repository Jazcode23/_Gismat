import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScreenId, TransitionType } from '../types';
import { GismatModal } from './GismatModal';
import { MapPicker } from './MapPicker';
import { API_ENABLED, ApiError } from '../services/apiClient';
import { gismatStore } from '../services/gismatStore';
import {
  Basural,
  BasuralForm,
  ESTADOS_EDITABLES,
  FORM_VACIO,
  HistorialFoco,
  MSG_TECNICO,
  PERMEABILIDADES,
  TIPOS_FOCO,
  esErrorTecnico,
  fotoSrc,
  puedeDarseDeBaja,
  TipoResiduoOpcion,
  basuralesService,
  formDesdeBasural,
  permisosUsuario,
  validarForm,
} from '../services/basuralesService';

interface ScreenBasuralesProps {
  onNavigate: (screen: ScreenId, transition?: TransitionType) => void;
}

const ESTADO_ESTILO: Record<string, string> = {
  activo: 'bg-red-50 text-red-700 border-red-200',
  pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  limpiado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  inactivo: 'bg-slate-100 text-slate-500 border-slate-200',
};
const EN_INTERVENCION_ESTILO = 'bg-blue-50 text-blue-700 border-blue-200';
const estadoEstilo = (b: { estado: string; enIntervencion?: boolean }) => (b.enIntervencion ? EN_INTERVENCION_ESTILO : ESTADO_ESTILO[b.estado]);
const estadoTexto = (b: { estado: string; enIntervencion?: boolean }) => (b.enIntervencion ? 'En intervención' : ESTADO_TXT[b.estado]);
const ESTADO_TXT: Record<string, string> = {
  activo: 'Activo',
  pendiente: 'Pendiente',
  limpiado: 'Limpiado',
  inactivo: 'Dado de baja',
};
const NIVEL_ESTILO: Record<string, string> = {
  Crítico: 'bg-red-50 text-red-700 border-red-200',
  Moderado: 'bg-amber-50 text-amber-700 border-amber-200',
  Bajo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const TIPO_TXT: Record<string, string> = { basural: 'Basural', microbasural: 'Microbasural', volcadero: 'Volcadero' };

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B6BC9]/40 focus:border-[#1B6BC9] disabled:bg-slate-100';

const Campo: React.FC<{ label: string; error?: string; ayuda?: string; children: React.ReactNode; className?: string }> = ({
  label,
  error,
  ayuda,
  children,
  className = '',
}) => (
  <label className={`block ${className}`}>
    <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
    {children}
    {error ? (
      <span className="block text-[11px] text-red-600 mt-1">{error}</span>
    ) : ayuda ? (
      <span className="block text-[11px] text-slate-400 mt-1">{ayuda}</span>
    ) : null}
  </label>
);

export const ScreenBasurales: React.FC<ScreenBasuralesProps> = ({ onNavigate }) => {
  const permisos = permisosUsuario();

  const [items, setItems] = useState<Basural[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorLista, setErrorLista] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // filtros (se aplican en el servidor)
  const [q, setQ] = useState('');
  const [fTipo, setFTipo] = useState('todos');
  const [fEstado, setFEstado] = useState('vigentes');
  const [fNivel, setFNivel] = useState('todos');

  // alta / edición
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Basural | null>(null);
  const [form, setForm] = useState<BasuralForm>(FORM_VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [tiposResiduo, setTiposResiduo] = useState<TipoResiduoOpcion[]>([]);
  const inputFoto = useRef<HTMLInputElement>(null);
  // Vista previa de la foto elegida (se libera al cambiar o cerrar para no perder memoria)
  const [previa, setPrevia] = useState<string | null>(null);
  useEffect(() => {
    if (!form.foto) { setPrevia(null); return; }
    const u = URL.createObjectURL(form.foto);
    setPrevia(u);
    return () => URL.revokeObjectURL(u);
  }, [form.foto]);

  // baja
  // consulta de detalle (CU008)
  const [detalle, setDetalle] = useState<Basural | null>(null);
  const [historial, setHistorial] = useState<HistorialFoco | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');

  const [aBaja, setABaja] = useState<Basural | null>(null);
  const [motivo, setMotivo] = useState('');
  const [errorBaja, setErrorBaja] = useState('');
  const [dandoBaja, setDandoBaja] = useState(false);

  const cargar = useCallback(async () => {
    if (!API_ENABLED) return;
    setCargando(true);
    setErrorLista('');
    try {
      // "vigentes" = todo menos las bajas; las bajas se piden aparte para poder auditarlas.
      const estado = fEstado === 'vigentes' || fEstado === 'todos' ? undefined : fEstado;
      const r = await basuralesService.listar({
        q,
        tipo: fTipo === 'todos' ? undefined : fTipo,
        estado,
        nivel: fNivel === 'todos' ? undefined : fNivel,
      });
      setItems(fEstado === 'vigentes' ? r.filter((b) => b.estado !== 'inactivo') : r);
    } catch (e) {
      setErrorLista((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [q, fTipo, fEstado, fNivel]);

  // búsqueda con pequeña demora para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => {
    if (API_ENABLED) basuralesService.tiposResiduo().then(setTiposResiduo).catch(() => setTiposResiduo([]));
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const kpis = useMemo(
    () => ({
      total: items.length,
      activos: items.filter((b) => b.estado === 'activo' || b.estado === 'pendiente').length,
      criticos: items.filter((b) => b.nivelRiesgo === 'Crítico' && b.estado !== 'inactivo').length,
      provisorios: items.filter((b) => b.irhProvisorio && b.estado !== 'inactivo').length,
    }),
    [items]
  );

  // Otras pantallas (trazabilidad, dashboard, riesgo) leen del store: se refresca sin bloquear la UI.
  const refrescarStore = () => {
    gismatStore.hydrate().catch(() => undefined);
  };

  // ------------------------------------------------------------ alta / edición
  const abrirAlta = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setErrores({});
    setErrorGeneral('');
    setFormAbierto(true);
  };

  const abrirEdicion = (b: Basural) => {
    setEditando(b);
    setForm(formDesdeBasural(b));
    setErrores({});
    setErrorGeneral('');
    setFormAbierto(true);
  };

  const set = <K extends keyof BasuralForm>(k: K, v: BasuralForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errores[k]) setErrores((e) => ({ ...e, [k]: '' }));
  };

  const guardar = async () => {
    const e = validarForm(form);
    setErrores(e);
    setErrorGeneral('');
    if (Object.keys(e).length) {
      const nombres: Record<string, string> = { ubicacion: 'dirección', latitud: 'ubicación en el mapa (latitud)', longitud: 'ubicación en el mapa (longitud)', volumenM3: 'volumen', superficieM2: 'superficie', foto: 'foto' };
      const faltan = Object.keys(e).map((k) => nombres[k] || k).join(', ');
      setErrorGeneral(`No se registró: revisá los campos marcados en rojo (${faltan}). Para ubicar el foco hacé clic en el mapa.`);
      setTimeout(() => document.querySelector('[data-testid="form-error"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    setGuardando(true);
    try {
      const r = editando ? await basuralesService.modificar(editando.id, form) : await basuralesService.crear(form);
      setFormAbierto(false);
      setAviso({
        tipo: 'ok',
        texto: editando
          ? `${r.id} actualizado. IRH vigente: ${r.irh} (${r.nivelRiesgo}).`
          : `${r.id} registrado. IRH calculado: ${r.irh} (${r.nivelRiesgo})${r.irhProvisorio ? ', provisorio hasta relevar los datos pendientes' : ''}.`,
      });
      await cargar();
      refrescarStore();
    } catch (err) {
      const ae = err as ApiError;
      // Errores por campo del servidor (mismas claves que envía el formulario)
      let general = '';
      if (ae.errors && typeof ae.errors === 'object' && !Array.isArray(ae.errors)) {
        const porCampo: Record<string, string> = {};
        const camposDelForm = new Set(Object.keys(FORM_VACIO));
        const sueltos: string[] = [];
        Object.entries(ae.errors).forEach(([k, v]) => {
          const txt = Array.isArray(v) ? v.join(' ') : String(v);
          if (camposDelForm.has(k)) porCampo[k] = txt;
          else sueltos.push(txt); // errores generales (non_field_errors) o de campos que el formulario no muestra
        });
        setErrores((prev) => ({ ...prev, ...porCampo }));
        general = sueltos.join(' ');
      }
      setErrorGeneral(esErrorTecnico(err) ? (editando ? MSG_TECNICO.modificacion : MSG_TECNICO.alta) : general || ae.message || (editando ? MSG_TECNICO.modificacion : MSG_TECNICO.alta));
    } finally {
      setGuardando(false);
    }
  };

  // ------------------------------------------------------------ consulta (CU008)
  const abrirDetalle = async (b: Basural) => {
    setDetalle(b);
    setHistorial(null);
    setErrorDetalle('');
    setCargandoDetalle(true);
    try {
      const [actual, hist] = await Promise.all([basuralesService.obtener(b.id), basuralesService.historial(b.id)]);
      setDetalle(actual);
      setHistorial(hist);
    } catch {
      setErrorDetalle(MSG_TECNICO.consulta); // CU008 3a
    } finally {
      setCargandoDetalle(false);
    }
  };

  // ------------------------------------------------------------ baja lógica
  const confirmarBaja = async () => {
    if (!aBaja) return;
    setDandoBaja(true);
    setErrorBaja('');
    try {
      await basuralesService.darDeBaja(aBaja.id, motivo);
      setAviso({ tipo: 'ok', texto: `${aBaja.id} dado de baja. El historial y las intervenciones se conservan.` });
      setABaja(null);
      setMotivo('');
      await cargar();
      refrescarStore();
    } catch (err) {
      setErrorBaja(esErrorTecnico(err) ? MSG_TECNICO.baja : (err as Error).message);
    } finally {
      setDandoBaja(false);
    }
  };

  const pendientesTxt = (b: Basural) =>
    (b.datosPendientes || []).map((d) => ({ volumen: 'volumen', permeabilidad: 'permeabilidad', tipo_residuo: 'tipo de residuo' }[d] || d)).join(', ');

  const link = (icono: string, texto: string, destino: ScreenId, activo = false) => (
    <a
      className={
        activo
          ? 'flex items-center space-x-3 px-4 py-3 rounded-xl bg-[#00B050] text-white font-semibold shadow-md transition text-sm cursor-pointer'
          : 'flex items-center space-x-3 px-4 py-3 rounded-lg text-white/90 hover:bg-white/10 transition text-sm font-medium cursor-pointer'
      }
      href={`#${destino}`}
      onClick={(e) => {
        e.preventDefault();
        if (!activo) onNavigate(destino, 'none');
      }}
    >
      <i className={`fa-solid ${icono} text-lg w-5`}></i>
      {!sidebarCollapsed && <span>{texto}</span>}
    </a>
  );

  return (
    <div className="bg-[#F6F9FD] text-slate-800 font-sans antialiased min-h-screen flex flex-col md:flex-row overflow-x-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarCollapsed ? 'w-20' : 'w-full md:w-64'} bg-[#1B6BC9] text-white flex-shrink-0 flex flex-col justify-between py-6 px-4 z-20 transition-all duration-200 select-none`}
      >
        <div>
          <div className="flex items-center space-x-3 px-3 mb-8">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md shrink-0">
              <i className="fa-solid fa-leaf text-[#00A854] text-xl"></i>
            </div>
            {!sidebarCollapsed && <span className="text-2xl font-black tracking-wide">GISMAT</span>}
          </div>
          <nav className="space-y-2">
            {link('fa-map-location-dot', 'Geoportal', 'GEOPORTAL')}
            {link('fa-desktop', 'Detecciones IA', 'CUR_02_AI_DETECTIONS')}
            {link('fa-droplet', 'Riesgo Hídrico', 'CUR_03_HYDROLOGICAL_RISK')}
            {link('fa-file-waveform', 'Trazabilidad', 'CUR_04_TRACEABILITY')}
            {link('fa-trash-can', 'Basurales', 'CUR_05_BASURALES', true)}
          </nav>
        </div>
        <div className="pt-6 border-t border-white/20 flex items-center justify-between text-xs text-white/75 px-2">
          <button className="flex items-center space-x-2 hover:text-white transition cursor-pointer" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            <i className="fa-solid fa-bars-staggered"></i>
            {!sidebarCollapsed && <span>Contraer</span>}
          </button>
          {!sidebarCollapsed && <span>v2.4</span>}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-10">
          <h1 className="text-slate-800 font-semibold text-base">Basurales</h1>
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-800 tracking-tight leading-tight">Municipalidad de San Miguel de Tucumán</p>
            <p className="text-[11px] text-slate-400">Sistema de Gestión Ambiental</p>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Administración de Basurales</h2>
              <p className="text-xs text-slate-500 mt-1">Alta, modificación y baja de basurales, microbasurales y volcaderos. El IRH se calcula automáticamente.</p>
            </div>
            {permisos.puedeCrear && (
              <button
                onClick={abrirAlta}
                disabled={!API_ENABLED}
                className="inline-flex items-center justify-center space-x-2 bg-[#00B050] hover:bg-[#009a45] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm cursor-pointer transition"
              >
                <i className="fa-solid fa-plus"></i>
                <span>Nuevo basural</span>
              </button>
            )}
          </div>

          {!API_ENABLED && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3">
              El ABM de basurales necesita conexión con el servidor (VITE_USE_API distinto de &quot;false&quot;).
            </div>
          )}

          {aviso && (
            <div
              role="status"
              className={`mb-4 rounded-xl border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
                aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <span>{aviso.texto}</span>
              <button className="text-xs opacity-60 hover:opacity-100 cursor-pointer" onClick={() => setAviso(null)} aria-label="Cerrar aviso">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          )}

          {/* KPIs */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { t: 'En la lista', v: kpis.total, c: 'text-slate-900' },
              { t: 'Activos / pendientes', v: kpis.activos, c: 'text-blue-700' },
              { t: 'Riesgo crítico', v: kpis.criticos, c: 'text-red-600' },
              { t: 'IRH provisorio', v: kpis.provisorios, c: 'text-amber-600' },
            ].map((k) => (
              <div key={k.t} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{k.t}</div>
                <div className={`text-2xl font-extrabold mt-1 ${k.c}`}>{k.v}</div>
              </div>
            ))}
          </section>

          {/* Filtros */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input
                className={`${inputCls} pl-9`}
                placeholder="Buscar por código, dirección, barrio o curso de agua"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar basurales"
              />
            </div>
            <select className={inputCls} value={fTipo} onChange={(e) => setFTipo(e.target.value)} aria-label="Filtrar por tipo">
              <option value="todos">Todos los tipos</option>
              {TIPOS_FOCO.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select className={inputCls} value={fEstado} onChange={(e) => setFEstado(e.target.value)} aria-label="Filtrar por estado">
              <option value="vigentes">Vigentes (sin bajas)</option>
              <option value="todos">Todos, incluidas bajas</option>
              <option value="activo">Activos</option>
              <option value="pendiente">Pendientes</option>
              <option value="limpiado">Limpiados</option>
              <option value="inactivo">Dados de baja</option>
            </select>
            <select className={inputCls} value={fNivel} onChange={(e) => setFNivel(e.target.value)} aria-label="Filtrar por nivel de riesgo">
              <option value="todos">Todos los niveles</option>
              <option value="Crítico">Crítico</option>
              <option value="Moderado">Moderado</option>
              <option value="Bajo">Bajo</option>
            </select>
          </section>

          {/* Tabla */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {errorLista && <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">{errorLista}</div>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3">Código</th>
                    <th className="text-left font-semibold px-4 py-3">Ubicación</th>
                    <th className="text-left font-semibold px-4 py-3">Tipo</th>
                    <th className="text-left font-semibold px-4 py-3">Estado</th>
                    <th className="text-left font-semibold px-4 py-3">IRH</th>
                    <th className="text-left font-semibold px-4 py-3 hidden lg:table-cell">Volumen</th>
                    <th className="text-left font-semibold px-4 py-3 hidden xl:table-cell">Curso de agua</th>
                    <th className="text-right font-semibold px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((b) => {
                    const baja = b.estado === 'inactivo';
                    return (
                      <tr key={b.id} className={baja ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-slate-50/60'}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{b.id}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {fotoSrc(b.foto) && <img src={fotoSrc(b.foto)!} alt="" loading="lazy" className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0" />}
                            <div className="min-w-0">
                              <div className={`font-medium ${baja ? '' : 'text-slate-800'}`}>{b.ubicacion}</div>
                              <div className="text-[11px] text-slate-400">{b.barrio || 'Sin barrio'} · {b.coordenadas[0]}, {b.coordenadas[1]}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">{TIPO_TXT[b.tipo] || b.tipo}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block border rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estadoEstilo(b)}`} data-testid="estado-foco">{estadoTexto(b)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block border rounded-md px-2 py-0.5 text-[11px] font-bold ${baja ? ESTADO_ESTILO.inactivo : NIVEL_ESTILO[b.nivelRiesgo]}`}>
                            {Math.round(b.irh)} · {b.nivelRiesgo}
                          </span>
                          {b.irhProvisorio && !baja && (
                            <span title={`Pendiente de relevar: ${pendientesTxt(b)}`} className="ml-1.5 text-[10px] font-semibold text-amber-600 cursor-help">
                              provisorio
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs">{b.volumenEstimado}</td>
                        <td className="px-4 py-3 hidden xl:table-cell text-xs">
                          {b.cursoAguaCercano ? `${b.cursoAguaCercano}${b.distanciaCursoAgua != null ? ` (${b.distanciaCursoAgua} m)` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg px-2.5 py-1.5 cursor-pointer"
                            onClick={() => abrirDetalle(b)}
                            title={`Consultar ${b.id}`}
                          >
                            <i className="fa-solid fa-eye"></i> Ver
                          </button>
                          {!baja && permisos.puedeEditar && (
                            <button
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B6BC9] hover:bg-blue-50 rounded-lg px-2.5 py-1.5 cursor-pointer ml-1"
                              onClick={() => abrirEdicion(b)}
                              title={`Modificar ${b.id}`}
                            >
                              <i className="fa-solid fa-pen-to-square"></i> Editar
                            </button>
                          )}
                          {!baja && permisos.puedeDarDeBaja && (
                            <button
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-lg px-2.5 py-1.5 cursor-pointer ml-1"
                              disabled={!puedeDarseDeBaja(b)}
                              onClick={() => {
                                setABaja(b);
                                setMotivo('');
                                setErrorBaja('');
                              }}
                              title={puedeDarseDeBaja(b) ? `Dar de baja ${b.id}` : 'Solo puede darse de baja un foco Activo o Saneado. Registrá primero la intervención.'}
                            >
                              <i className="fa-solid fa-ban"></i> Baja
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!items.length && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                        {cargando ? 'Cargando…' : API_ENABLED ? 'No hay basurales que coincidan con los filtros.' : 'Sin conexión con el servidor.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          {!permisos.puedeEditar && (
            <p className="text-xs text-slate-400 mt-3">Tu rol ({permisos.rol || 'sin sesión'}) tiene acceso de solo lectura en este módulo.</p>
          )}
        </main>
      </div>

      {/* Modal alta / edición */}
      <GismatModal
        isOpen={formAbierto}
        onClose={() => !guardando && setFormAbierto(false)}
        headerTheme="blue"
        title={editando ? `Modificar ${editando.id}` : 'Nuevo basural'}
        subtitle={editando ? editando.ubicacion : 'El IRH, la microcuenca y el curso de agua cercano se calculan al guardar'}
        maxWidthClass="w-[94vw] sm:w-[80vw] lg:w-[62vw] max-w-[860px]"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">Los campos sin relevar dejan el IRH como provisorio.</span>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer" onClick={() => setFormAbierto(false)} disabled={guardando}>
                Cancelar
              </button>
              <button
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#1B6BC9] hover:bg-[#155aa8] text-white disabled:opacity-60 cursor-pointer"
                onClick={guardar}
                disabled={guardando}
              >
                {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar basural'}
              </button>
            </div>
          </div>
        }
      >
        {errorGeneral && <div data-testid="form-error" role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorGeneral}</div>}

        {editando && (
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              ['IRH vigente', `${Math.round(editando.irh)} (${editando.nivelRiesgo})`],
              ['Microcuenca', editando.microcuencaId || '—'],
              ['Curso cercano', editando.cursoAguaCercano ? `${editando.cursoAguaCercano}${editando.distanciaCursoAgua != null ? ` · ${editando.distanciaCursoAgua} m` : ''}` : '—'],
              ['Intervenciones', String(editando.totalIntervenciones)],
            ].map(([t, v]) => (
              <div key={t} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{t}</div>
                <div className="font-semibold text-slate-700 truncate" title={v}>{v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Tipo de foco *">
            <select className={inputCls} value={form.tipo} onChange={(e) => set('tipo', e.target.value as BasuralForm['tipo'])}>
              {TIPOS_FOCO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Estado de intervención" ayuda={editando ? 'Para retirarlo del sistema usá “Baja” en la lista.' : undefined}>
            <select className={inputCls} value={form.estado} onChange={(e) => set('estado', e.target.value as BasuralForm['estado'])}>
              {ESTADOS_EDITABLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Campo>

          <Campo label="Dirección / ubicación *" error={errores.ubicacion} className="sm:col-span-2">
            <input className={inputCls} value={form.ubicacion} maxLength={200} onChange={(e) => set('ubicacion', e.target.value)} placeholder="Ej. Av. Mate de Luna y Canal Norte" />
          </Campo>

          <Campo label="Barrio" error={errores.barrio} className="sm:col-span-2">
            <input className={inputCls} value={form.barrio} maxLength={120} onChange={(e) => set('barrio', e.target.value)} placeholder="Ej. Villa 9 de Julio" />
          </Campo>

          <div className="sm:col-span-2">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Ubicación en el mapa *</span>
            {form.latitud.trim() === '' || form.longitud.trim() === '' ? (
              <p data-testid="aviso-mapa" className={`mb-2 rounded-lg border px-3 py-2 text-xs font-medium ${errores.latitud || errores.longitud ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                <i className="fa-solid fa-location-dot mr-1.5"></i>
                Es obligatorio marcar el basural en el mapa: hacé clic en el lugar exacto. Sin ese punto no se puede registrar.
              </p>
            ) : (
              <p data-testid="aviso-mapa" className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                <i className="fa-solid fa-circle-check mr-1.5"></i>Ubicación marcada. Podés moverla haciendo clic en otro punto del mapa.
              </p>
            )}
            <MapPicker
              lat={form.latitud.trim() === '' || Number.isNaN(Number(form.latitud.replace(',', '.'))) ? null : Number(form.latitud.replace(',', '.'))}
              lng={form.longitud.trim() === '' || Number.isNaN(Number(form.longitud.replace(',', '.'))) ? null : Number(form.longitud.replace(',', '.'))}
              onPick={(lat, lng) => {
                setForm((f) => ({ ...f, latitud: String(lat), longitud: String(lng) }));
                setErrores((e) => ({ ...e, latitud: '', longitud: '' }));
              }}
            />
            <p className="text-[11px] text-slate-400 mt-1">Hacé clic en el mapa donde está el foco: se completan la latitud y la longitud. También podés escribirlas.</p>
          </div>
          <Campo label="Latitud *" error={errores.latitud} ayuda="Grados decimales, ej. -26.8151">
            <input className={inputCls} inputMode="decimal" value={form.latitud} onChange={(e) => set('latitud', e.target.value)} placeholder="-26.8151" />
          </Campo>
          <Campo label="Longitud *" error={errores.longitud} ayuda="Grados decimales, ej. -65.2096">
            <input className={inputCls} inputMode="decimal" value={form.longitud} onChange={(e) => set('longitud', e.target.value)} placeholder="-65.2096" />
          </Campo>

          <Campo label="Volumen estimado (m³)" error={errores.volumenM3} ayuda="Vacío = pendiente de relevar">
            <input className={inputCls} inputMode="decimal" value={form.volumenM3} onChange={(e) => set('volumenM3', e.target.value)} placeholder="400" />
          </Campo>
          <Campo label="Superficie (m²)" error={errores.superficieM2}>
            <input className={inputCls} inputMode="decimal" value={form.superficieM2} onChange={(e) => set('superficieM2', e.target.value)} placeholder="600" />
          </Campo>

          <Campo label="Permeabilidad del suelo" error={errores.permeabilidad} ayuda="Sin relevar = pendiente">
            <select className={inputCls} value={form.permeabilidad} onChange={(e) => set('permeabilidad', e.target.value as BasuralForm['permeabilidad'])}>
              <option value="">Sin relevar</option>
              {PERMEABILIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Campo>
          <Campo label="Detalle de permeabilidad" error={errores.permeabilidadDetalle}>
            <input className={inputCls} value={form.permeabilidadDetalle} maxLength={120} onChange={(e) => set('permeabilidadDetalle', e.target.value)} placeholder="Ej. suelo aluvial" />
          </Campo>

          <Campo label="Tipo de residuo" error={errores.tipoResiduo} ayuda="Sin relevar = pendiente" className="sm:col-span-2">
            <select className={inputCls} value={form.tipoResiduo} onChange={(e) => set('tipoResiduo', e.target.value)}>
              <option value="">Sin relevar</option>
              {tiposResiduo.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </Campo>

          <div className="sm:col-span-2">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Foto del foco</span>
            <div className="flex items-start gap-3">
              {(() => {
                const actual = !form.quitarFoto ? fotoSrc(editando?.foto) : null;
                const src = previa || actual;
                return src ? (
                  <img src={src} alt={`Foto del foco ${editando?.id ?? 'nuevo'}`} className="w-28 h-20 object-cover rounded-lg border border-slate-200" />
                ) : (
                  <div className="w-28 h-20 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[11px] text-slate-400 text-center px-2">Sin foto</div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <input
                  ref={inputFoto}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#1B6BC9] hover:file:bg-blue-100"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setForm((p) => ({ ...p, foto: f, quitarFoto: false }));
                    if (errores.foto) setErrores((er) => ({ ...er, foto: '' }));
                  }}
                />
                <p className={`text-[11px] mt-1 ${errores.foto ? 'text-red-600' : 'text-slate-400'}`}>{errores.foto || 'JPG, PNG o WebP · hasta 5 MB. Se muestra en el detalle del foco.'}</p>
                {(form.foto || (editando?.foto && !form.quitarFoto)) && (
                  <button
                    type="button"
                    className="mt-1 text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
                    onClick={() => {
                      setForm((p) => ({ ...p, foto: null, quitarFoto: !!editando?.foto && !p.foto ? true : p.quitarFoto }));
                      if (inputFoto.current) inputFoto.current.value = '';
                    }}
                  >
                    {form.foto ? 'Descartar la foto elegida' : 'Quitar la foto actual'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <Campo label="Observaciones" error={errores.observaciones} className="sm:col-span-2">
            <textarea className={inputCls} rows={3} value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
          </Campo>
          <Campo label="Próxima acción recomendada" error={errores.proximaAccionRecomendada} className="sm:col-span-2">
            <textarea className={inputCls} rows={2} value={form.proximaAccionRecomendada} onChange={(e) => set('proximaAccionRecomendada', e.target.value)} />
          </Campo>
        </div>
      </GismatModal>

      {/* Modal consulta (CU008) */}
      <GismatModal
        isOpen={!!detalle}
        onClose={() => setDetalle(null)}
        headerTheme="light"
        title={detalle ? `${detalle.id} · ${TIPO_TXT[detalle.tipo] || detalle.tipo}` : ''}
        subtitle={detalle?.ubicacion}
        maxWidthClass="w-[94vw] sm:w-[80vw] lg:w-[62vw] max-w-[860px]"
        footer={
          <div className="flex justify-end">
            <button className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer" onClick={() => setDetalle(null)}>
              Cerrar
            </button>
          </div>
        }
      >
        {detalle && (
          <div data-testid="detalle-foco" className="space-y-4 text-sm">
            {errorDetalle && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{errorDetalle}</div>}

            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-block border rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estadoEstilo(detalle)}`} data-testid="estado-foco-detalle">{estadoTexto(detalle)}</span>
              {Number.isFinite(detalle.irh) ? (
                <span className={`inline-block border rounded-md px-2 py-0.5 text-[11px] font-bold ${NIVEL_ESTILO[detalle.nivelRiesgo]}`}>
                  IRH {detalle.irh} / 100 · {detalle.nivelRiesgo}
                </span>
              ) : (
                <span className="inline-block border rounded-md px-2 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-500 border-slate-200">IRH no disponible</span>
              )}
              {detalle.irhProvisorio && <span className="text-[11px] font-semibold text-amber-600">provisorio · pendiente de relevar: {pendientesTxt(detalle)}</span>}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {([
                ['Ubicación', detalle.ubicacion],
                ['Barrio', detalle.barrio || '—'],
                ['Coordenadas', `${detalle.coordenadas[0]}, ${detalle.coordenadas[1]}`],
                ['Microcuenca', detalle.microcuencaId || '—'],
                ['Curso de agua cercano', detalle.cursoAguaCercano ? `${detalle.cursoAguaCercano}${detalle.distanciaCursoAgua != null ? ` · ${detalle.distanciaCursoAgua} m` : ''}` : '—'],
                ['Tipo de residuo', tiposResiduo.find((t) => t.id === detalle.tipoResiduo)?.nombre || detalle.tipoResiduo || 'Sin relevar'],
                ['Volumen estimado', detalle.volumenEstimado],
                ['Superficie', detalle.superficieM2 ? `${detalle.superficieM2} m²` : 'Sin relevar'],
                ['Permeabilidad del suelo', detalle.permeabilidadSuelo + (detalle.permeabilidadDetalle ? ` (${detalle.permeabilidadDetalle})` : '')],
                ['Fecha de registro', detalle.fechaRegistro],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{k}</dt>
                  <dd className="text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>

            {fotoSrc(detalle.foto) && (
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Fotografía de campo</div>
                <img src={fotoSrc(detalle.foto)!} alt={`Fotografía de campo del foco ${detalle.id}`} className="max-h-56 rounded-lg border border-slate-200 object-cover" />
              </div>
            )}
            {detalle.observaciones && (
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Observaciones</div>
                <p className="text-slate-700">{detalle.observaciones}</p>
              </div>
            )}

            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Historial de intervenciones{historial ? ` (${historial.intervenciones.length})` : ''}
              </div>
              {cargandoDetalle && <p className="text-slate-400 text-xs">Cargando…</p>}
              {historial && !historial.intervenciones.length && <p className="text-slate-500 text-xs">Este foco todavía no tiene intervenciones registradas.</p>}
              {historial && historial.intervenciones.length > 0 && (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {historial.intervenciones.slice(0, 5).map((i) => (
                    <li key={i.id} className="px-3 py-2 flex flex-wrap justify-between gap-x-4 text-xs">
                      <span><strong className="text-slate-700">{i.fecha}</strong> · {i.tipo}</span>
                      <span className="text-slate-500">
                        {i.cuadrillaNombre || 'Sin cuadrilla'} · {i.volumen_removido_ton} t
                        {i.irh_antes != null && i.irh_despues != null ? ` · IRH ${i.irh_antes} → ${i.irh_despues}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {historial && historial.intervenciones.length > 5 && <p className="text-[11px] text-slate-400 mt-1">Se muestran las 5 más recientes. El historial completo está en Trazabilidad.</p>}
            </div>
          </div>
        )}
      </GismatModal>

      {/* Modal baja */}
      <GismatModal
        isOpen={!!aBaja}
        onClose={() => !dandoBaja && setABaja(null)}
        headerTheme="light"
        title={`Dar de baja ${aBaja?.id ?? ''}`}
        subtitle={aBaja?.ubicacion}
        maxWidthClass="w-[94vw] sm:w-[60vw] max-w-[520px]"
        footer={
          <div className="flex justify-end gap-2">
            <button className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer" onClick={() => setABaja(null)} disabled={dandoBaja}>
              Cancelar
            </button>
            <button className="px-5 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-60 cursor-pointer" onClick={confirmarBaja} disabled={dandoBaja}>
              {dandoBaja ? 'Procesando…' : 'Confirmar baja'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 mb-4">
          Es una <strong>baja lógica</strong>: el basural deja de figurar como vigente y no podrá modificarse, pero su historial de IRH y sus intervenciones se conservan.
        </p>
        {errorBaja && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorBaja}</div>}
        <Campo label="Motivo de la baja (opcional)" ayuda="Hasta 200 caracteres. Queda registrado.">
          <textarea className={inputCls} rows={3} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Registro duplicado / cargado por error" />
        </Campo>
      </GismatModal>
    </div>
  );
};
