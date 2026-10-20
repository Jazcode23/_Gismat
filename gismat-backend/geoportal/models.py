from django.conf import settings
from django.contrib.gis.db import models as gis
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

IRH_VALIDATORS = [MinValueValidator(0), MaxValueValidator(100)]


class TipoResiduo(models.Model):
    """Composición del residuo. `factor_peligrosidad` (0-1) alimenta el IRH."""

    codigo = models.SlugField(unique=True)
    nombre = models.CharField(max_length=80)
    descripcion = models.TextField(blank=True)
    factor_peligrosidad = models.FloatField(default=0.5, validators=[MinValueValidator(0), MaxValueValidator(1)])

    class Meta:
        verbose_name_plural = "tipos de residuo"

    def __str__(self):
        return self.nombre


class Origen(models.TextChoices):
    OFICIAL = "oficial", "Oficial"
    SIMULADO = "simulado", "Simulado (no es cartografía oficial)"


class CursoAgua(models.Model):
    class Tipo(models.TextChoices):
        RIO = "Río Principal", "Río Principal"
        CANAL = "Canal Troncal Pluvial", "Canal Troncal Pluvial"
        ARROYO = "Arroyo", "Arroyo"
        ZANJA = "Zanja Colectora", "Zanja Colectora"

    class Conservacion(models.TextChoices):
        CRITICO = "Crítico", "Crítico"
        REGULAR = "Regular", "Regular"
        BUENO = "Bueno", "Bueno"

    codigo = models.SlugField(unique=True)
    nombre = models.CharField(max_length=120)
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    estado_conservacion = models.CharField(max_length=10, choices=Conservacion.choices, default=Conservacion.REGULAR)
    buffer_metros = models.PositiveIntegerField(default=50)
    origen = models.CharField(max_length=10, choices=Origen.choices, default=Origen.OFICIAL)
    geom = gis.LineStringField(srid=4326, spatial_index=True)

    class Meta:
        verbose_name_plural = "cursos de agua"

    def __str__(self):
        return self.nombre


class Microcuenca(models.Model):
    codigo = models.SlugField(unique=True)
    nombre = models.CharField(max_length=120)
    color = models.CharField(max_length=9, default="#0d9488")
    recomendaciones = models.TextField(blank=True)
    cursos_asociados = models.JSONField(default=list, blank=True)
    superficie_km2_declarada = models.FloatField(null=True, blank=True,
                                                 help_text="Si se carga, prevalece sobre el área calculada del polígono.")
    origen = models.CharField(max_length=10, choices=Origen.choices, default=Origen.OFICIAL)
    geom = gis.PolygonField(srid=4326, spatial_index=True)

    def __str__(self):
        return self.nombre


class ZonaRiesgo(models.Model):
    class Tipo(models.TextChoices):
        INUND = "Inundabilidad Aluvial", "Inundabilidad Aluvial"
        LIX = "Lixiviados Estivales", "Lixiviados Estivales"
        EROS = "Erosión de Márgenes", "Erosión de Márgenes"

    class Nivel(models.TextChoices):
        ALTO = "Alto", "Alto"
        MUY_ALTO = "Muy Alto", "Muy Alto"
        EXTREMO = "Extremo", "Extremo"

    codigo = models.SlugField(unique=True)
    nombre = models.CharField(max_length=150)
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    nivel = models.CharField(max_length=10, choices=Nivel.choices)
    descripcion = models.TextField(blank=True)
    geom = gis.PolygonField(srid=4326, spatial_index=True)

    class Meta:
        verbose_name_plural = "zonas de riesgo"


class PuntoMonitoreo(models.Model):
    class Tipo(models.TextChoices):
        HIDRO = "Estación Hidrométrica", "Estación Hidrométrica"
        PLUVIO = "Sensor Pluviométrico", "Sensor Pluviométrico"
        AFORO = "Aforo de Caudal", "Aforo de Caudal"

    codigo = models.SlugField(unique=True)
    nombre = models.CharField(max_length=150)
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    ultimo_dato = models.CharField(max_length=120, blank=True)
    valor_medido = models.CharField(max_length=40, blank=True)
    operativo = models.BooleanField(default=True)
    geom = gis.PointField(srid=4326, spatial_index=True)

    class Meta:
        verbose_name_plural = "puntos de monitoreo"


class Barrio(models.Model):
    codigo = models.SlugField(unique=True)
    nombre = models.CharField(max_length=120)
    habitantes_aprox = models.PositiveIntegerField(default=0)
    geom = gis.PolygonField(srid=4326, spatial_index=True)


class Cuadrilla(models.Model):
    codigo = models.SlugField(unique=True)
    nombre = models.CharField(max_length=120)
    especialidad = models.CharField(max_length=120, blank=True)
    disponible = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre


class Foco(models.Model):
    class Tipo(models.TextChoices):
        BASURAL = "basural", "Basural"
        MICRO = "microbasural", "Microbasural"
        VOLCADERO = "volcadero", "Volcadero"

    class Estado(models.TextChoices):
        ACTIVO = "activo", "Activo"
        PENDIENTE = "pendiente", "Pendiente de intervención"
        LIMPIADO = "limpiado", "Limpiado"
        INACTIVO = "inactivo", "Inactivo"  # baja lógica

    class Permeabilidad(models.TextChoices):
        ALTA = "alta", "Alta"
        MEDIA_ALTA = "media_alta", "Media-Alta"
        MEDIA = "media", "Media"
        MEDIA_BAJA = "media_baja", "Media-Baja"
        BAJA = "baja", "Baja"

    class Nivel(models.TextChoices):
        BAJO = "Bajo", "Bajo"
        MODERADO = "Moderado", "Moderado"
        CRITICO = "Crítico", "Crítico"

    codigo = models.CharField(max_length=20, unique=True, editable=False)
    tipo = models.CharField(max_length=15, choices=Tipo.choices, default=Tipo.BASURAL)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.ACTIVO, db_index=True)
    tipo_residuo = models.ForeignKey(TipoResiduo, null=True, blank=True, on_delete=models.PROTECT, related_name="focos")

    ubicacion = gis.PointField(srid=4326, spatial_index=True)
    direccion = models.CharField(max_length=200)
    barrio = models.CharField(max_length=120, blank=True)

    volumen_m3 = models.FloatField(default=0, validators=[MinValueValidator(0)])
    superficie_m2 = models.FloatField(default=0, validators=[MinValueValidator(0)])
    permeabilidad = models.CharField(max_length=12, choices=Permeabilidad.choices, default=Permeabilidad.MEDIA)
    permeabilidad_detalle = models.CharField(max_length=120, blank=True)
    observaciones = models.TextField(blank=True)
    proxima_accion = models.TextField(blank=True)
    foto = models.ImageField(upload_to="focos/%Y/%m/", null=True, blank=True)

    # Campos derivados (se recalculan en el backend; nunca vienen del cliente)
    microcuenca = models.ForeignKey(Microcuenca, null=True, blank=True, on_delete=models.SET_NULL, related_name="focos")
    curso_cercano = models.ForeignKey(CursoAgua, null=True, blank=True, on_delete=models.SET_NULL, related_name="focos")
    distancia_curso_m = models.FloatField(null=True, blank=True)
    irh = models.FloatField(default=0, validators=IRH_VALIDATORS, db_index=True)
    nivel_riesgo = models.CharField(max_length=10, choices=Nivel.choices, default=Nivel.BAJO, db_index=True)

    fecha_registro = models.DateField(default=timezone.localdate, db_index=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="focos_creados")
    datos_pendientes = models.JSONField(default=list, blank=True,
        help_text="Variables del IRH no relevadas: volumen, permeabilidad, tipo_residuo. Mientras haya alguna, el IRH es provisorio.")
    baja_fecha = models.DateTimeField(null=True, blank=True)
    baja_motivo = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-irh", "codigo"]
        indexes = [models.Index(fields=["estado", "nivel_riesgo"])]

    PREFIJO = {"basural": "BR", "microbasural": "MB", "volcadero": "VC"}

    def save(self, *args, **kwargs):
        if not self.codigo:
            from .services.focos import siguiente_codigo
            self.codigo = siguiente_codigo(self.tipo)
        super().save(*args, **kwargs)

    @property
    def irh_provisorio(self):
        return bool(self.datos_pendientes)

    @property
    def lat(self):
        return self.ubicacion.y

    @property
    def lng(self):
        return self.ubicacion.x

    def __str__(self):
        return f"{self.codigo} · {self.direccion}"


class Intervencion(models.Model):
    class Estado(models.TextChoices):
        PROGRAMADA = "programada", "Programada"
        EN_PROCESO = "en_proceso", "En proceso"
        COMPLETADA = "completada", "Completada"

    foco = models.ForeignKey(Foco, on_delete=models.CASCADE, related_name="intervenciones")
    fecha = models.DateField(default=timezone.localdate, db_index=True)
    tipo = models.CharField(max_length=200)
    cuadrilla = models.ForeignKey(Cuadrilla, null=True, blank=True, on_delete=models.SET_NULL)
    cuadrilla_texto = models.CharField(max_length=150, blank=True)
    responsable = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
                                    related_name="intervenciones")
    observaciones = models.TextField(blank=True)
    etiquetas = models.JSONField(default=list, blank=True)
    volumen_removido_ton = models.FloatField(default=0, validators=[MinValueValidator(0)])
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.COMPLETADA)
    irh_antes = models.FloatField(null=True, blank=True)
    irh_despues = models.FloatField(null=True, blank=True)
    creada = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha", "-creada"]
        verbose_name_plural = "intervenciones"


class HistorialIRH(models.Model):
    """Evolución del riesgo. Solo se inserta; nunca se modifica ni borra."""

    foco = models.ForeignKey(Foco, on_delete=models.CASCADE, related_name="historial_irh")
    fecha_calculo = models.DateTimeField(default=timezone.now, db_index=True)
    valor = models.FloatField(validators=IRH_VALIDATORS)
    nivel = models.CharField(max_length=10, choices=Foco.Nivel.choices)
    variables = models.JSONField(default=dict)
    motivo = models.CharField(max_length=60, blank=True)

    class Meta:
        ordering = ["-fecha_calculo", "-id"]
        verbose_name_plural = "historial de IRH"


class Alerta(models.Model):
    class Tipo(models.TextChoices):
        PROXIMIDAD = "proximidad_curso", "Proximidad a curso de agua"
        IRH = "irh_critico", "IRH crítico"
        LLUVIAS = "lluvias_previstas", "Lluvias previstas"
        LIXIVIADOS = "lixiviados", "Lixiviados / seguimiento"

    class Nivel(models.TextChoices):
        INFO = "informativa", "Informativa"
        ADVERTENCIA = "advertencia", "Advertencia"
        CRITICA = "critica", "Crítica"

    class Estado(models.TextChoices):
        ACTIVA = "activa", "Activa"
        ATENDIDA = "atendida", "Atendida"

    foco = models.ForeignKey(Foco, on_delete=models.CASCADE, related_name="alertas")
    microcuenca = models.ForeignKey(Microcuenca, null=True, blank=True, on_delete=models.SET_NULL)
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    nivel = models.CharField(max_length=12, choices=Nivel.choices)
    titulo = models.CharField(max_length=220)
    mensaje = models.TextField()
    recomendacion = models.TextField(blank=True)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.ACTIVA, db_index=True)
    fecha = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-fecha"]


class DeteccionIA(models.Model):
    """Detecciones del módulo de IA satelital. Punto de integración futuro: el módulo de IA
    solo debe insertar registros con estado 'nuevo' (POST /api/detecciones-ia/)."""

    class Estado(models.TextChoices):
        NUEVO = "nuevo", "Nuevo"
        CONFIRMADO = "confirmado", "Confirmado"
        DESCARTADO = "descartado", "Descartado"

    codigo = models.CharField(max_length=20, unique=True, editable=False)
    ubicacion = gis.PointField(srid=4326, spatial_index=True)
    direccion = models.CharField(max_length=200)
    confianza = models.FloatField(validators=IRH_VALIDATORS)
    area_m2 = models.FloatField(default=0)
    fecha = models.DateField(default=timezone.localdate)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.NUEVO, db_index=True)
    foco = models.ForeignKey(Foco, null=True, blank=True, on_delete=models.SET_NULL, related_name="detecciones")
    cauce = models.CharField(max_length=120, blank=True)
    distancia_curso_m = models.FloatField(null=True, blank=True)
    pendiente = models.CharField(max_length=80, blank=True)
    densidad = models.CharField(max_length=80, blank=True)
    vulnerabilidad_hidrica = models.PositiveSmallIntegerField(default=0, validators=IRH_VALIDATORS)
    escurrimiento = models.PositiveSmallIntegerField(default=0, validators=IRH_VALIDATORS)
    residuos_peligrosos = models.PositiveSmallIntegerField(default=0, validators=IRH_VALIDATORS)
    # Clasificación que informa el módulo de IA (vacío si no la informa; al confirmar se usa para el tipo del foco).
    tipo_foco = models.CharField(max_length=12, choices=Foco.Tipo.choices, blank=True, default="")
    # SIMULADO = dato de prueba generado por el sistema (no es una detección real). OFICIAL = detección real del módulo de IA.
    origen = models.CharField(max_length=10, choices=Origen.choices, default=Origen.OFICIAL)

    class Meta:
        ordering = ["-fecha", "-id"]
        verbose_name_plural = "detecciones IA"

    def save(self, *args, **kwargs):
        if not self.codigo:
            n = DeteccionIA.objects.count() + 1
            while DeteccionIA.objects.filter(codigo=f"AI-{n:03d}").exists():
                n += 1
            self.codigo = f"AI-{n:03d}"
        super().save(*args, **kwargs)
