-- Ejecutar como superusuario de PostgreSQL:  psql -U postgres -f scripts/crear_bd.sql
-- Cambiá la contraseña antes de ejecutar (debe coincidir con DB_PASSWORD del .env).
CREATE USER gismat WITH PASSWORD 'CAMBIAR_ESTA_CLAVE';
CREATE DATABASE gismat OWNER gismat ENCODING 'UTF8';
\c gismat
CREATE EXTENSION IF NOT EXISTS postgis;
-- Django migra con el usuario gismat; la extensión ya queda creada por el superusuario.
GRANT ALL ON SCHEMA public TO gismat;
