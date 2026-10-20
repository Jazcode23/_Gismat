"""Simula SOLO los datos que la planilla de basurales no trae, sobre los focos reales ya importados.

    python manage.py simular_datos_faltantes                 # DRY-RUN (por defecto): muestra el plan, no escribe nada
    python manage.py simular_datos_faltantes --aplicar       # escribe la simulación
    python manage.py simular_datos_faltantes --revertir      # deshace la simulación (vuelve al estado del CSV)

Qué NO toca: ID, dirección, coordenadas, código BR-xxx ni el estado original de ningún foco que no se simule.
Qué simula (valores ficticios, DETERMINISTAS: misma corrida => mismos valores):
  - volumen_m3, superficie_m2, permeabilidad y tipo de residuo de los focos que los tienen "pendientes de relevar";
  - algunas intervenciones completadas y focos en estado "pendiente"/"limpiado", para que los indicadores del
    dashboard (intervenciones, espacios recuperados, tasa de intervención, reducción de IRH) no queden en 0.
Todo lo simulado queda marcado con "[SIMULADO]" en observaciones y con la etiqueta "simulado" en las intervenciones.
Es idempotente (no vuelve a simular un foco ya marcado), no borra focos ni historial de IRH, y es reversible.
"""
import random
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from geoportal import models as m
from geoportal.services.focos import recalcular, registrar_intervencion

MARCA = "[SIMULADO]"
ETIQUETA = "simulado"
PENDIENTES_ORIGINALES = ["permeabilidad", "tipo_residuo", "volumen"]  # tal como los deja el importador del CSV
CUADRILLAS_TXT = ["Cuadrilla Alfa – Saneamiento Hidráulico", "Cuadrilla Beta – Desobstrucción Pluvial",
                  "Cuadrilla Gamma – Residuos Especiales", "Cuadrilla Espacios Verdes - Brigada 01"]
PERMEABILIDADES = ["alta", "media_alta", "media", "media_baja", "baja"]
PESOS_PERM = [2, 3, 4, 2, 1]
PESOS_RESIDUO = {"mixto": 5, "escombros": 3, "organico": 2, "plasticos": 2, "industrial": 1, "neumaticos": 1}
PCT_INTERVENIDOS = 0.32   # fracción de focos con intervención completada
PCT_PENDIENTES = 0.10     # fracción de focos marcados "pendiente de intervención"


# ---------- lógica pura (sin base de datos) ----------
def plan_foco(codigo):
    """Valores simulados para un foco, determinados solo por su código."""
    rnd = random.Random(f"gismat-sim-{codigo}")
    volumen = round(min(520.0, max(6.0, rnd.lognormvariate(4.1, 0.9))), 1)   # mediana ~60 m³
    altura = rnd.uniform(0.3, 1.1)
    return {
        "volumen": volumen,
        "superficie": round(volumen / altura, 1),
        "permeabilidad": rnd.choices(PERMEABILIDADES, PESOS_PERM)[0],
        "residuo": rnd.choices(list(PESOS_RESIDUO), list(PESOS_RESIDUO.values()))[0],
        "sorteo": random.Random(f"gismat-sim-sorteo-{codigo}").random(),  # decide si se interviene / queda pendiente
        "cuadrilla": rnd.choice(CUADRILLAS_TXT),
        "dias_atras": rnd.randint(0, 2),
        "limpia": random.Random(f"gismat-sim-limpia-{codigo}").random() < 0.45,  # ¿queda limpio o solo se reduce?
    }
# ---------- fin lógica pura ----------


class Command(BaseCommand):
    help = "Simula volumen/permeabilidad/residuo/intervenciones sobre los focos reales (reversible, dry-run por defecto)."

    def add_arguments(self, p):
        p.add_argument("--aplicar", action="store_true", help="Escribe la simulación (sin esto es dry-run).")
        p.add_argument("--revertir", action="store_true", help="Deshace la simulación.")

    def handle(self, *a, aplicar, revertir, **kw):
        if revertir:
            return self.revertir(aplicar)
        tipos = {t.codigo: t for t in m.TipoResiduo.objects.all()}
        if not tipos:
            raise CommandError("No hay tipos de residuo cargados. Ejecutá antes: python manage.py cargar_datos_demo --solo-referencia "
                               "(solo crea catálogos de tipos de residuo y cuadrillas; no toca focos).")
        focos = list(m.Foco.objects.filter(codigo__startswith="BR-").exclude(estado="inactivo").order_by("codigo"))
        candidatos = [f for f in focos if MARCA not in f.observaciones and f.datos_pendientes]
        ya = len(focos) - len(candidatos)
        self.stdout.write(f"Focos BR-xxx: {len(focos)} · a simular: {len(candidatos)} · ya simulados u omitidos: {ya}")
        if not candidatos:
            return self.stdout.write("Nada para simular.")

        hoy = timezone.localdate()
        n_int = n_pend = 0
        resumen = []
        for f in candidatos:
            pl = plan_foco(f.codigo)
            interviene = pl["sorteo"] < PCT_INTERVENIDOS and pl["volumen"] > 40
            pendiente = (not interviene) and PCT_INTERVENIDOS <= pl["sorteo"] < PCT_INTERVENIDOS + PCT_PENDIENTES
            n_int += interviene
            n_pend += pendiente
            resumen.append((f, pl, interviene, pendiente))
        self.stdout.write(f"Plan: {len(resumen)} focos con volumen/permeabilidad/residuo simulados · "
                          f"{n_int} intervenciones completadas · {n_pend} focos en 'pendiente de intervención'.")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))

        with transaction.atomic():
            for f, pl, interviene, pendiente in resumen:
                f.volumen_m3, f.superficie_m2 = pl["volumen"], pl["superficie"]
                f.permeabilidad = pl["permeabilidad"]
                f.tipo_residuo = tipos.get(pl["residuo"]) or next(iter(tipos.values()))
                f.datos_pendientes = []
                if pendiente:
                    f.estado = m.Foco.Estado.PENDIENTE
                f.observaciones = (f"{MARCA} Volumen, superficie, permeabilidad y tipo de residuo SIMULADOS (no relevados). "
                                   f"{f.observaciones}").strip()
                recalcular(f, motivo="simulacion")
                if interviene:
                    cuad = m.Cuadrilla.objects.filter(nombre=pl["cuadrilla"]).first()
                    # limpia: se retira casi todo (queda <= 20 m³ => 'limpiado'); si no, se retira ~25 %
                    ton = (f.volumen_m3 - 10) * 0.6 if pl["limpia"] and f.volumen_m3 > 20 else f.volumen_m3 * 0.25 * 0.6
                    registrar_intervencion(
                        f, None, "Intervención de saneamiento (simulada)", observaciones=f"{MARCA} Intervención de ejemplo.",
                        cuadrilla=cuad, cuadrilla_texto=pl["cuadrilla"], etiquetas=[ETIQUETA],
                        fecha=max(f.fecha_registro, hoy - timedelta(days=pl["dias_atras"])),
                        volumen_removido_ton=round(ton, 2))
        self.stdout.write(self.style.SUCCESS(
            f"Simulación aplicada: {len(resumen)} focos · {n_int} intervenciones · {n_pend} pendientes. "
            f"Para deshacer: python manage.py simular_datos_faltantes --revertir --aplicar"))

    def revertir(self, aplicar):
        focos = list(m.Foco.objects.filter(observaciones__contains=MARCA))
        ints = m.Intervencion.objects.filter(etiquetas__contains=[ETIQUETA])
        self.stdout.write(f"A revertir: {len(focos)} focos simulados y {ints.count()} intervenciones simuladas.")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))
        with transaction.atomic():
            ints.delete()
            for f in focos:
                f.volumen_m3 = f.superficie_m2 = 0
                f.permeabilidad = m.Foco.Permeabilidad.MEDIA
                f.tipo_residuo = None
                f.datos_pendientes = list(PENDIENTES_ORIGINALES)
                f.estado = m.Foco.Estado.ACTIVO   # la planilla original trae todos los basurales como "Activo"
                f.observaciones = f.observaciones.replace(
                    f"{MARCA} Volumen, superficie, permeabilidad y tipo de residuo SIMULADOS (no relevados). ", "").strip()
                recalcular(f, motivo="reversion_simulacion")   # agrega una fila al historial; no borra el existente
        self.stdout.write(self.style.SUCCESS("Simulación revertida. Los focos volvieron a los datos del CSV."))
