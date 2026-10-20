"""Crea un usuario por rol. La contraseña se pasa por argumento o se genera al azar (nunca va en el código)."""
import secrets
import string

from django.core.management.base import BaseCommand

from accounts.models import Roles, Usuario


class Command(BaseCommand):
    help = "Crea un usuario de ejemplo por cada rol."

    def add_arguments(self, parser):
        parser.add_argument("--password", help="Contraseña común (si se omite se genera una aleatoria).")

    def handle(self, *a, password=None, **kw):
        if not password:
            alfabeto = string.ascii_letters + string.digits
            password = "".join(secrets.choice(alfabeto) for _ in range(12)) + "aA1!"
        for rol, nombre in ((Roles.ADMINISTRADOR, "admin"), (Roles.OPERADOR, "operador"),
                            (Roles.ANALISTA, "analista"), (Roles.SUPERVISOR, "supervisor")):
            u, creado = Usuario.objects.get_or_create(username=nombre, defaults=dict(
                email=f"{nombre}@gismat.local", rol=rol, email_verificado=True, first_name=nombre.capitalize(),
                is_staff=(rol == Roles.ADMINISTRADOR), is_superuser=(rol == Roles.ADMINISTRADOR)))
            if creado:
                u.set_password(password)
                u.save()
                self.stdout.write(f"  creado {nombre} ({rol})")
        self.stdout.write(self.style.SUCCESS(f"Contraseña de los usuarios creados: {password}"))
