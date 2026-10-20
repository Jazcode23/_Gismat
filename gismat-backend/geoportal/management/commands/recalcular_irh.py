"""Recalcula ubicación derivada + IRH de todos los focos (p. ej. tras cargar hidrografía oficial)."""
from django.core.management.base import BaseCommand

from geoportal.models import Foco
from geoportal.services.focos import recalcular


class Command(BaseCommand):
    help = "Recalcula el IRH de todos los focos vigentes y agrega el cálculo al historial."

    def handle(self, *a, **kw):
        n = 0
        for f in Foco.objects.select_related("tipo_residuo"):
            recalcular(f, motivo="recalculo_masivo")
            n += 1
        self.stdout.write(self.style.SUCCESS(f"{n} focos recalculados."))
