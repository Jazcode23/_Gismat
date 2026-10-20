import re
from django.core.exceptions import ValidationError


class PoliticaContrasena:
    """Mínimo 8 caracteres, mayúscula, minúscula, número y símbolo."""

    def validate(self, password, user=None):
        errores = []
        if len(password) < 8:
            errores.append("al menos 8 caracteres")
        if not re.search(r"[A-ZÁÉÍÓÚÑ]", password):
            errores.append("una mayúscula")
        if not re.search(r"[a-záéíóúñ]", password):
            errores.append("una minúscula")
        if not re.search(r"\d", password):
            errores.append("un número")
        if not re.search(r"[^\w\s]", password):
            errores.append("un símbolo")
        if errores:
            raise ValidationError("La contraseña debe tener: " + ", ".join(errores) + ".")

    def get_help_text(self):
        return "Mínimo 8 caracteres con mayúscula, minúscula, número y símbolo."
