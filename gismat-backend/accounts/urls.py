from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("usuarios", views.UsuarioViewSet, basename="usuario")

auth_patterns = [
    path("login/", views.LoginView.as_view()),
    path("registro/", views.RegistroView.as_view()),
    path("logout/", views.LogoutView.as_view()),
    path("perfil/", views.PerfilView.as_view()),
    path("cambiar-contrasena/", views.CambioContrasenaView.as_view()),
    path("verificar-email/", views.VerificarEmailView.as_view()),
    path("recuperar/", views.RecuperarView.as_view()),
    path("restablecer/", views.RestablecerView.as_view()),
]

urlpatterns = [path("auth/", include(auth_patterns)), path("", include(router.urls))]
