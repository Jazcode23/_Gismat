from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone


class Roles(models.TextChoices):
    ADMINISTRADOR = "administrador", "Administrador"
    OPERADOR = "operador", "Operador Municipal"
    ANALISTA = "analista", "Analista Ambiental"
    SUPERVISOR = "supervisor", "Supervisor"


class UsuarioManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, username, email, password=None, **extra):
        if not username or not email:
            raise ValueError("Usuario y correo son obligatorios")
        user = self.model(username=username, email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("rol", Roles.ADMINISTRADOR)
        extra.setdefault("email_verificado", True)
        return self.create_user(username, email, password, **extra)


class Usuario(AbstractUser):
    """Usuario del sistema. Estado activo/inactivo = is_active."""

    email = models.EmailField("correo electrónico", unique=True)
    documento = models.CharField(max_length=15, unique=True, null=True, blank=True)
    rol = models.CharField(max_length=15, choices=Roles.choices, default=Roles.OPERADOR)
    email_verificado = models.BooleanField(default=False)
    fecha_creacion = models.DateTimeField(default=timezone.now)

    objects = UsuarioManager()
    REQUIRED_FIELDS = ["email"]

    class Meta:
        ordering = ["username"]

    def save(self, *args, **kwargs):
        self.email = (self.email or "").lower()
        if self.documento == "":
            self.documento = None
        super().save(*args, **kwargs)

    @property
    def nombre_completo(self):
        return f"{self.first_name} {self.last_name}".strip() or self.username

    def __str__(self):
        return f"{self.username} ({self.get_rol_display()})"
