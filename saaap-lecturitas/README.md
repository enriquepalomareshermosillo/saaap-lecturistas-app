# SAAAP-Lecturitas para Android

App Ionic con Capacitor. El APK de pruebas se conecta por defecto a la API de la red local.

## Probar en un teléfono

1. Instala **SAAAP-Lecturitas-pruebas.apk** y conecta el teléfono a la misma red privada que la computadora que ejecuta la API.
2. En la computadora, abre PowerShell en la carpeta **app_saaap_lecturistas_api** y arranca la API.

~~~powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet run --urls http://0.0.0.0:5080
ipconfig
~~~

3. En el navegador del teléfono abre **http://192.168.1.76:5080/salud**. Debe responder con el nombre de la API.
4. La app Android trae configurada **http://192.168.1.76:5080**. Si ya guardaste otra dirección o cambia la IP del equipo, abre **Conexión con la API** en el login y ajusta la dirección.
5. Entra con un lecturista activo de la base de pruebas y la clave que devuelve el SP de login de esa base.

Si el emulador necesita acceder al equipo anfitrión mediante su alias, puedes guardar **http://10.0.2.2:5080** en **Conexión con la API**. El APK de pruebas permite HTTP para la conexión local.

Si IIS publica la API en una subruta, escribe la dirección completa en **Conexión con la API**, incluida la subruta de la aplicación, por ejemplo **http://192.168.1.76:5080/app_saaap_lecturistas_api**.

## Recorrido de captura

Después del login se abre **Buscar medidor**. Selecciona un calendario abierto para ver el indicador de avance. Puedes buscar por serie, número de cuenta o nombre. **No. de cuenta** abre el teclado numérico y conserva los ceros iniciales. En **Tomar lectura**, captura la lectura final y comprueba el consumo en m³. Una lectura final menor que la inicial mantiene deshabilitado el guardado. Al guardar, la app vuelve a la búsqueda, conserva el calendario y el filtro seleccionado, actualiza el indicador y limpia el texto y los resultados de búsqueda.

## Recompilar

Requiere Node.js 22 o superior, JDK 21 y Android SDK 36. Con **JAVA_HOME** y **ANDROID_HOME** configurados, ejecuta esto desde la carpeta de la app:

~~~powershell
npm.cmd ci
npm.cmd run android:sync
cd android
.\gradlew.bat assembleDebug
~~~

Gradle deja el APK en **android/app/build/outputs/apk/debug/app-debug.apk**.

## APK de producción

Ejecuta **npm.cmd run android:sync:release** antes de **gradlew.bat assembleRelease** para incorporar la URL de **.env.android-release**. Android autoriza HTTP en Release únicamente para el dominio de **produccion_red.xml**. El APK Release debe alinearse con **zipalign** y firmarse con **apksigner** usando la misma clave de **firmas/saaap-lecturitas.p12** en cada actualización.

La contraseña de firma guardada en **firmas/saaap-lecturitas.dpapi** la puede descifrar el usuario de Windows que la creó, en este equipo. Respalda la clave y guarda su contraseña en un gestor seguro para poder publicar futuras actualizaciones desde otro equipo.
