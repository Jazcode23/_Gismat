from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ("username", "email", "rol", "is_active", "email_verificado")
    fieldsets = UserAdmin.fieldsets + (("GISMAT", {"fields": ("rol", "documento", "email_verificado")}),)
