"""Regenera frontend/src/data/metadatosFallback.json desde services/metadatos.py (respaldo del modo demo sin API).

Uso (desde gismat-backend):  python scripts/exportar_metadatos_frontend.py
No requiere base de datos: solo los umbrales por defecto (IRH_UMBRAL_CRITICO=70, IRH_UMBRAL_MODERADO=40).
"""
import json
import sys
import types
from pathlib import Path

from django.conf import settings

raiz = Path(__file__).resolve().parent.parent
settings.configure(IRH_UMBRAL_CRITICO=70.0, IRH_UMBRAL_MODERADO=40.0)
for nombre, ruta in (("geoportal", raiz / "geoportal"), ("geoportal.services", raiz / "geoportal" / "services")):
    mod = types.ModuleType(nombre)
    mod.__path__ = [str(ruta)]
    sys.modules[nombre] = mod
from geoportal.services.metadatos import metadatos  # noqa: E402

destino = raiz.parent / "frontend" / "src" / "data" / "metadatosFallback.json"
destino.write_text(json.dumps(metadatos(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Escrito {destino}")
