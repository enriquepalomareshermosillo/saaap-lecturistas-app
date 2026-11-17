# app_saaap_lecturistas_api

API de pruebas de SAAAP-Lecturitas. Requiere .NET 8 y una base de SQL Server con los procedimientos instalados en el esquema **dbo**. Para habilitar el resumen por calendario, ejecuta [resumen-lecturas.sql](../resumen-lecturas.sql) en esa base.

## Configuración local

La instancia **.\SQLSERVER2022**, el usuario **sa** y el nombre de la base se configuran en [appsettings.json](appsettings.json). Cambia el valor de **BaseDatos** dentro de **SqlServer** al cambiar de base y reinicia la API.

Para pruebas locales, escribe la contraseña de **sa** en **SqlServer → Contrasena** en **appsettings.json**. Si ya habías configurado **SqlServer:Contrasena** o **SqlServer:BaseDatos** en los secretos de desarrollo, esos valores tienen prioridad en modo **Development**. Mantén fuera del repositorio cualquier copia del archivo que contenga una contraseña real.

Inicia la API en modo **Development**:

~~~powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet run --urls http://localhost:5080
~~~

Desde otra ventana de PowerShell, comprueba el arranque y prueba el login con un lecturista activo de tu base de pruebas:

~~~powershell
$api = "http://localhost:5080"
Invoke-RestMethod "$api/salud"

$codigo = Read-Host "Código de empleado de pruebas"
$clave = Read-Host "Contraseña del lecturista" -AsSecureString
$sesion = Invoke-RestMethod "$api/api/login" -Method Post -ContentType "application/json" -Body (
    @{ empleadoCodigo = $codigo; contrasena = [System.Net.NetworkCredential]::new('', $clave).Password } | ConvertTo-Json
)
$headers = @{ Authorization = "Bearer $($sesion.token)" }
Invoke-RestMethod "$api/api/calendarios" -Headers $headers
~~~

El login compara la contraseña con el valor de **LecturistaClave** devuelto por **dbo.app_Lecturista_Login**. El token vence a las ocho horas y las sesiones se pierden al reiniciar la API.

## Publicación en IIS

El perfil **IIS-Win-x64** publica en **Release**, para Windows x64, con el runtime .NET 8.0.32 como mínimo y selección del parche 8.0 más reciente instalado. En IIS, usa un grupo de aplicaciones x64 y el **Hosting Bundle**, que instala el módulo ASP.NET Core de IIS. Completa la conexión SQL en el servidor después de extraer el ZIP y conserva la contraseña fuera del paquete.

## Rutas

Las rutas de captura y cierre de sesión requieren el encabezado **Authorization: Bearer TOKEN**.

| Método | Ruta | Entrada |
|---|---|---|
| GET | /salud | Verifica que el proceso de la API responde. |
| POST | /api/login | JSON con **empleadoCodigo** y **contrasena**. |
| POST | /api/logout | Invalida el token. |
| GET | /api/calendarios | Devuelve los calendarios abiertos. |
| GET | /api/calendarios/{calendarioId}/resumen | Devuelve **medidoresActivos**, **conLectura** y **pendientes** para el calendario abierto indicado. |
| GET | /api/medidores | Parámetros **buscarPor** (MEDIDOR, CUENTA o NOMBRE) y **texto**. |
| GET | /api/lecturas/captura | Parámetros **medidorSerie** y **calendarioId**. |
| PUT | /api/lecturas/captura | JSON con **medidorSerie**, **calendarioId** y **lecturaFinal**. |

La API usa la fecha de captura reportada por SQL Server y devuelve **lecturaFinal** y **consumoM3** como **null** cuando todavía no existe una lectura. Al guardar, **esNueva** indica si se insertó una fila o se actualizó una existente.

El resumen cuenta todos los medidores con **MedidorCancelado = 0**. Para el calendario elegido, un medidor cuenta como leído si tiene al menos una fila con **LecturaCancelado = 0**. Por ejemplo, con una sesión iniciada:

~~~powershell
Invoke-RestMethod "$api/api/calendarios/40023/resumen" -Headers $headers
~~~
