"""Revisa los focos abiertos con IRH alto y emite las alertas que correspondan (para correr periódicamente, p. ej. con cron)."""
from django.core.management.base import BaseCommand

from geoportal.services import alertas


class Command(BaseCommand):
    help = "Emite alertas de focos críticos sin alerta o sin intervenir pasados ALERTA_SEGUIMIENTO_DIAS."

    def handle(self, *a, **kw):
        creadas = alertas.revisar()
        self.stdout.write(self.style.SUCCESS(f"{len(creadas)} alertas nuevas."))
