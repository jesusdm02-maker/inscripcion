# Sistema de preinscripciones

## Estructura del proyecto

- `backend/` - API REST en Node.js con Express usando arquitectura MVC:
  - `routes/` define las rutas
  - `controllers/` gestiona la lógica de respuesta
  - `models/` ejecuta consultas SQL sobre la base de datos
- `frontend/` - Aplicación React con Vite:
  - `src/components/` contiene las vistas del dashboard
  - `src/services/api.js` actúa como capa de acceso a datos REST

## Requisitos

- XAMPP con MySQL/MariaDB (la base del proyecto se comprobó con MariaDB 10.4 de XAMPP).
- Node.js y npm.
- Node.js 20.19+ o 22.12+.
- La base `preinscripciones` restaurada en XAMPP.

## Inicio local con XAMPP y CMD

El sistema usa XAMPP como base de datos, y el frontend y backend se ejecutan en terminales separadas. La configuración local está en `backend/.env` (`127.0.0.1:3306`, `root`, contraseña vacía y base `preinscripciones`).

1. Abre el **XAMPP Control Panel** y pulsa **Start** en **MySQL**.
2. Abre una terminal CMD en la carpeta del proyecto e inicia la API:

   ```cmd
   cd backend
   if not exist .env copy .env.example .env
   npm install
   npm run dev
   ```

   El backend espera la conexión a la base antes de iniciarse y queda disponible en `http://localhost:4000`.
3. Abre otra terminal CMD en la carpeta del proyecto e inicia Vite:

   ```cmd
   cd frontend
   npm install
   npm run dev
   ```

4. Abre `http://localhost:5173` en el navegador.

Mantén abiertas ambas terminales mientras uses el sistema. Para detener cada servidor, pulsa `Ctrl+C` en su terminal; luego puedes detener MySQL desde XAMPP Control Panel.

## Trasladar el sistema a otra laptop conservando los datos

El paquete listo para trasladar está en el Escritorio, dentro de `Traslado_Laptop/Colegio.zip`. El ZIP contiene la carpeta raíz `Colegio` con los nombres y la estructura originales, incluyendo el código, configuración local (`.env`), dependencias instaladas, archivos compilados, `Base de datos/preinscripciones.sql` con la exportación actual y `backend/storage/pending-solicitudes.json` con solicitudes pendientes y adjuntos temporales. Por seguridad no contiene `backend/storage/auth-sessions.json`; los usuarios deberán iniciar sesión nuevamente.

El SQL es una exportación completa de la base `preinscripciones` configurada en XAMPP, tomada al preparar el paquete el 20 de octubre de 2026. Incluye las **24 tablas, 237 filas, 99 columnas, 53 restricciones y 51 componentes de índices**, además de los documentos binarios. La restauración se probó en un esquema temporal y se compararon todas las filas y valores binarios, la definición de columnas, índices, restricciones, opciones de tablas y contadores `AUTO_INCREMENT`; no hubo diferencias. Esta base no tiene vistas, triggers, procedimientos, funciones ni eventos. El esquema temporal se eliminó y la base original no se modificó.

La exportación cubre la base de la aplicación `preinscripciones`, no las bases internas de XAMPP/MySQL (`mysql`, `phpmyadmin`, entre otras) ni las cuentas globales del servidor. El archivo JSON de solicitudes pendientes también se conserva; al preparar este paquete no había solicitudes pendientes.

### Restauración en la laptop nueva

1. Instala XAMPP y Node.js 20.19+ o 22.12+; copia y descomprime `Colegio.zip` en la carpeta donde guardarás el proyecto. El ZIP crea una carpeta `Colegio`.
2. Antes de restaurar, detén MySQL y cualquier backend que esté usando la base de destino. Inicia MySQL desde XAMPP. El siguiente comando **reemplaza las tablas existentes** de `preinscripciones`; úsalo en una instalación nueva o después de respaldar la base que ya exista en la laptop.
3. Desde CMD, situado en la carpeta raíz descomprimida, importa el SQL:

   ```cmd
   C:\xampp\mysql\bin\mysql.exe -u root < "Base de datos\preinscripciones.sql"
   ```

   Si el usuario `root` de XAMPP tiene contraseña, añade `-p` antes del símbolo `<` y escríbela cuando el cliente la solicite.
4. El paquete ya incluye los datos de solicitudes pendientes en su ubicación original (`backend\storage\pending-solicitudes.json`); no reemplaces ese archivo. Si vas a combinarlo con otra copia del proyecto, conserva también ese archivo antes de iniciar el backend.

5. Revisa la configuración local del backend y confirma que coincida con XAMPP:

   ```cmd
   notepad backend\.env
   ```

   Si XAMPP usa otra contraseña, puerto o usuario, actualiza `backend\.env`. El paquete conserva la configuración local original, que apunta a MariaDB en `127.0.0.1:3306`.
6. Instala dependencias y arranca backend y frontend siguiendo la sección «Inicio local con XAMPP y CMD».
7. Comprueba la base en phpMyAdmin (`http://localhost/phpmyadmin`) antes de empezar a registrar nuevos datos.

Conserva el ZIP original en otro lugar seguro hasta terminar las comprobaciones. El SQL y el JSON contienen información personal del sistema: transfiérelos en un dispositivo seguro y no los publiques ni los agregues a Git.

### Base de datos y herramientas visuales

La aplicación apunta a la base local de XAMPP. Puedes explorar tablas y registros en phpMyAdmin, normalmente en `http://localhost/phpmyadmin`.

## Backend

```cmd
cd backend
if not exist .env copy .env.example .env
REM Ajusta DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE y DB_PORT si hace falta.
npm install
npm run dev
```

El servidor se ejecuta en `http://localhost:4000`.

### Variables de entorno

La configuración de ejemplo usa `127.0.0.1:3306`, usuario `root`, contraseña vacía y base `preinscripciones`, que coincide con la configuración XAMPP habitual. Ajusta `backend/.env` si cambiaste esos valores.

### Endpoints disponibles

- `GET /api/health`
- `GET /api/alumnos`
- `GET /api/representantes`
- `GET /api/preinscripciones`
- `GET /api/dashboard/summary`
- `GET /api/modulos` (catálogo sincronizado de navegación; solo lectura)

### Usuarios, roles y módulos

- Inicia sesión con `POST /api/auth/login`. La respuesta incluye un token de acceso válido durante 8 horas; envíalo como `Authorization: Bearer <token>` en las operaciones protegidas. Los encabezados de rol enviados por el cliente no conceden acceso.
- El administrador puede gestionar usuarios en `/api/auth/users` y roles en `/api/roles`. El catálogo `/api/modulos` es de solo lectura y se sincroniza al iniciar el backend con las diez opciones reales del sidebar, en su mismo orden. Cada submódulo tiene su propio registro relacionado en `modulo`, `paginas`, `r_m_ur` y `r_mp_per`; la migración conserva y distribuye los permisos existentes desde los módulos anteriores. Los permisos por rol se configuran desde Usuarios.
- Para crear usuarios primero debe existir un rol distinto de administrador. No se puede eliminar un rol asignado a usuarios ni el rol administrador; tampoco se puede eliminar la cuenta activa o el último administrador.
- Las sesiones existentes antes de habilitar los tokens deben renovarse iniciando sesión de nuevo.

## Frontend

```cmd
cd frontend
npm install
npm run dev
```

La app de React se servirá en `http://localhost:5173`.

## Notas adicionales

- El backend usa `dotenv` para variables de entorno.
- El frontend consume la API en `http://localhost:4000/api`.
- Antes de aplicar cambios de esquema, crea una copia de seguridad de la base de XAMPP.
