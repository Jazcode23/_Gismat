@echo off
setlocal EnableExtensions
title GISMAT - Inicio
cd /d "%~dp0"
set "RAIZ=%~dp0"
set "BACK=%RAIZ%gismat-backend"
set "FRONT=%RAIZ%frontend"
set "PY=%BACK%\.venv\Scripts\python.exe"

echo ============================================================
echo   GISMAT - Inicio automatico
echo ============================================================

if not exist "%PY%" (
  echo ERROR: no se encuentra %PY%
  echo Ejecuta este archivo desde la carpeta GISMAT, sin moverlo de lugar.
  goto fin
)
if not exist "%FRONT%\package.json" (
  echo ERROR: no se encuentra la carpeta frontend.
  goto fin
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado o no esta en el PATH.
  goto fin
)

cd /d "%BACK%"

echo.
echo Aplicando cambios pendientes de la base de datos - solo agrega columnas, no borra nada
"%PY%" manage.py migrate --noinput
if errorlevel 1 goto error

if exist ".gismat_datos_ok" (
  echo.
  echo Los datos ya fueron cargados antes. Se omite la carga.
  goto arrancar
)

echo.
echo [1/6] Importando los basurales del CSV - solo los que falten, no se borra nada
"%PY%" manage.py importar_basurales_csv datasetbasurales.csv --aplicar
if errorlevel 1 goto error

echo.
echo [2/6] Cargando capas del Geoportal y detecciones del modulo IA
"%PY%" manage.py cargar_capas_ia --aplicar
if errorlevel 1 goto error

echo.
echo [3/6] Descargando cursos de agua reales de OpenStreetMap - requiere internet
"%PY%" manage.py descargar_cursos_agua_osm
if errorlevel 1 (
  echo AVISO: no se pudieron descargar los cursos de agua. El sistema funciona igual sin ellos.
  echo Ejecuta ACTUALIZAR_CURSOS_AGUA.bat mas tarde, con internet.
  goto simular
)
"%PY%" manage.py importar_capa cursos-agua data\hidrografia_smt_osm.geojson --reemplazar --origen oficial
if errorlevel 1 goto error
"%PY%" manage.py cargar_capas_ia --aplicar
if errorlevel 1 goto error
"%PY%" manage.py ajustar_detecciones_cursos --aplicar
if errorlevel 1 goto error
"%PY%" manage.py derivar_capas_desde_cursos --aplicar
if errorlevel 1 goto error

:simular
echo.
echo [4/6] Simulando los datos que el CSV no trae - marcados como SIMULADO
"%PY%" manage.py simular_datos_faltantes --aplicar
if errorlevel 1 (
  echo Faltan catalogos de tipos de residuo. Se cargan y se reintenta.
  "%PY%" manage.py cargar_datos_demo --solo-referencia
  if errorlevel 1 goto error
  "%PY%" manage.py simular_datos_faltantes --aplicar
  if errorlevel 1 goto error
)
echo.
echo [5/6] Simulando la historia de los meses anteriores - altas, evolucion del IRH, intervenciones y detecciones IA
"%PY%" manage.py simular_historial --aplicar
if errorlevel 1 goto error
echo.
echo [6/6] Simulando el historial de detecciones de IA de enero a octubre - marcadas como SIMULADAS
"%PY%" manage.py simular_detecciones_ia --aplicar
if errorlevel 1 goto error
echo cargado > ".gismat_datos_ok"
echo.
echo Datos cargados correctamente.

:arrancar
echo.
echo Iniciando servidores...
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo El backend ya estaba activo en el puerto 8000. No se inicia de nuevo.
) else (
  start "GISMAT Backend - NO CERRAR" /d "%BACK%" cmd /k ".venv\Scripts\python.exe manage.py runserver 8000"
)

if not exist "%FRONT%\node_modules" (
  echo Instalando dependencias del frontend, puede tardar unos minutos...
  pushd "%FRONT%"
  call npm install --legacy-peer-deps
  popd
)

netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo El frontend ya estaba activo en el puerto 3000. No se inicia de nuevo.
) else (
  start "GISMAT Frontend - NO CERRAR" /d "%FRONT%" cmd /k "npm run dev"
)

echo.
echo Esperando que los servidores arranquen...
timeout /t 12 /nobreak >nul
start "" http://localhost:3000
echo.
echo LISTO. Se abrio http://localhost:3000 en el navegador.
echo Para detener GISMAT, cierra las dos ventanas negras que se abrieron.
goto fin

:error
echo.
echo ============================================================
echo OCURRIO UN ERROR. Copia el mensaje de arriba y pasaselo a Claude.
echo Verifica tambien que PostgreSQL este iniciado.
echo Los comandos usan transacciones: un paso con error no deja datos parciales.
echo ============================================================

:fin
echo.
pause
endlocal
