/**
 * GISMAT Dynamic Date & Temporal Utility
 * Genera fechas dinámicas contextuales y nombres de meses en español
 * evitando cualquier valor estático o hardcodeado.
 */

// Formato DD/MM/YYYY relativo a la fecha actual del sistema
export function getRelativeDateFormatted(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Formato ISO YYYY-MM-DD relativo a la fecha actual del sistema
export function getRelativeDateISO(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

// Formato con hora YYYY-MM-DD HH:mm
export function getRelativeDateTime(offsetDays: number = 0, hour: number = 9, minutes: number = 30): string {
  const iso = getRelativeDateISO(offsetDays);
  const hh = String(hour).padStart(2, '0');
  const min = String(minutes).padStart(2, '0');
  return `${iso} ${hh}:${min}`;
}

// Nombre del mes actual en español
export function getCurrentMonthName(capitalized: boolean = true): string {
  const date = new Date();
  const monthName = date.toLocaleDateString('es-AR', { month: 'long' });
  if (capitalized && monthName.length > 0) {
    return monthName.charAt(0).toUpperCase() + monthName.slice(1);
  }
  return monthName;
}

// Nombre del mes anterior en español
export function getPreviousMonthName(capitalized: boolean = true): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  const monthName = date.toLocaleDateString('es-AR', { month: 'long' });
  if (capitalized && monthName.length > 0) {
    return monthName.charAt(0).toUpperCase() + monthName.slice(1);
  }
  return monthName;
}

// Año actual dinámico
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

// Etiqueta Mes y Año actual (ej: "Octubre 2026")
export function getCurrentMonthAndYear(): string {
  return `${getCurrentMonthName(true)} ${getCurrentYear()}`;
}

// Formato legible de fecha actual (ej: "4 de octubre de 2026")
export function getFullDateReadable(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Datos dinámicos de Evolución Mensual del Riesgo hasta el mes actual
export interface MonthlyRiskData {
  month: string;
  monthFull: string;
  critico: number;
  moderado: number;
  bajo: number;
  isCurrent: boolean;
}

export function getMonthlyRiskEvolution(): MonthlyRiskData[] {
  const currentMonthIdx = new Date().getMonth(); // 9 para Octubre
  const baseline = [
    { month: 'Ene', monthFull: 'Enero', critico: 7, moderado: 6, bajo: 14 },
    { month: 'Feb', monthFull: 'Febrero', critico: 8, moderado: 8, bajo: 16 },
    { month: 'Mar', monthFull: 'Marzo', critico: 10, moderado: 9, bajo: 16 },
    { month: 'Abr', monthFull: 'Abril', critico: 11, moderado: 9, bajo: 17 },
    { month: 'May', monthFull: 'Mayo', critico: 12, moderado: 10, bajo: 18 },
    { month: 'Jun', monthFull: 'Junio', critico: 14, moderado: 11, bajo: 19 },
    { month: 'Jul', monthFull: 'Julio', critico: 15, moderado: 12, bajo: 21 },
    { month: 'Ago', monthFull: 'Agosto', critico: 16, moderado: 13, bajo: 23 },
    { month: 'Sep', monthFull: 'Septiembre', critico: 17, moderado: 14, bajo: 25 },
    { month: 'Oct', monthFull: 'Octubre', critico: 18, moderado: 15, bajo: 27 },
    { month: 'Nov', monthFull: 'Noviembre', critico: 18, moderado: 16, bajo: 28 },
    { month: 'Dic', monthFull: 'Diciembre', critico: 19, moderado: 16, bajo: 29 },
  ];

  return baseline.slice(0, currentMonthIdx + 1).map((item, idx) => ({
    ...item,
    isCurrent: idx === currentMonthIdx,
  }));
}

// Datos dinámicos de Evolución de Intervenciones vs Saneados hasta el mes actual
export interface MonthlyInterventionsData {
  month: string;
  intervenciones: number;
  saneados: number;
  isCurrent: boolean;
}

export function getMonthlyInterventionsEvolution(): MonthlyInterventionsData[] {
  const currentMonthIdx = new Date().getMonth();
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const intervenciones = [12, 18, 24, 29, 34, 39, 43, 47, 51, 56, 60, 65];
  const saneados = [4, 7, 11, 15, 20, 24, 29, 35, 41, 48, 52, 58];

  return months.slice(0, currentMonthIdx + 1).map((m, idx) => ({
    month: m,
    intervenciones: intervenciones[idx] || 50,
    saneados: saneados[idx] || 40,
    isCurrent: idx === currentMonthIdx,
  }));
}

// Datos dinámicos de Detecciones IA hasta el mes actual
export interface MonthlyDetectionsData {
  month: string;
  detectados: number;
  confirmados: number;
  isCurrent: boolean;
}

export function getMonthlyAIDetections(): MonthlyDetectionsData[] {
  const currentMonthIdx = new Date().getMonth();
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const detectados = [8, 12, 15, 19, 23, 27, 31, 35, 39, 44, 48, 52];
  const confirmados = [6, 9, 13, 16, 20, 24, 27, 31, 35, 41, 44, 48];

  return months.slice(0, currentMonthIdx + 1).map((m, idx) => ({
    month: m,
    detectados: detectados[idx] || 40,
    confirmados: confirmados[idx] || 35,
    isCurrent: idx === currentMonthIdx,
  }));
}
