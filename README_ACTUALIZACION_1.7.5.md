# Corrección v1.7.5 — Continuar todo el canal

## Problema corregido

En v1.7.4 podían encontrarse solo 32 videos de un canal más grande. Las solicitudes de continuación se hacían desde el contexto de la extensión, y la alternativa de desplazamiento podía funcionar en una pestaña no activa o declarar agotado el listado prematuramente. Además, «Buscar videos nuevos» reiniciaba la exploración en el primer grupo.

## Cambios

1. Una vez transcrito el primer grupo, la paginación se solicita con `fetch` **desde una pestaña normal de YouTube** (`chrome.scripting.executeScript`, `world: MAIN`). Esto cambia el origen de la solicitud para que sea el de la propia página. No se solicitan contraseñas, tokens del usuario, servicios de terceros ni una clave propia de YouTube Data API.
2. Si la continuación falla, se intenta recorrer visualmente la lista con una pestaña **activa** para permitir el desplazamiento y la carga diferida de las tarjetas. Ese desplazamiento no garantiza resultados si YouTube restringe las solicitudes.
3. Cuando una primera página contiene alrededor de 32 videos y no expone un token válido, el programa comprueba el final en la página visual antes de declararlo completo. Si un checkpoint confirma que queda otra página y no se puede cargar, el trabajo se marca **incompleto**, no finalizado.
4. Las pantallas distinguen «100 % de los encontrados» del estado real de la exploración. El botón principal dice «Continuar canal completo» mientras queden secciones por explorar.
5. Los trabajos creados con v1.7.4 o anteriores se **migran automáticamente una sola vez**: se reinicia únicamente el listado, conservando todas las transcripciones y el estado de los videos ya examinados.
6. Continúa vigente el procesamiento incremental, la espera entre videos y la cuota máxima por sesión. Cambiar la cuota en el desplegable tiene efecto también al pulsar «Continuar canal completo».

## Instalar sobre v1.7.4 (sin perder los datos)

1. **No desinstales** la extensión ni borres sus datos. Si es posible, descarga antes un ZIP de respaldo de los transcritos.
2. Descomprime `youtube-transcript-parche-v1.7.5.zip`. Copia **el contenido de `parche/`** a la carpeta de la extensión instalada, encima de los archivos actuales.
3. Abre `chrome://extensions` y pulsa **Recargar** en esa misma extensión. No uses «Cargar descomprimida» para crear una copia adicional.
4. Abre el gestor, selecciona tu canal anterior, confirma **Todo el canal** en «Cantidad por sesión» y pulsa **Continuar canal completo**.
5. Los primeros 32 videos ya guardados se reconocerán como duplicados y no se volverán a transcribir. Después se intentarán recuperar los siguientes grupos.

El almacenamiento está vinculado al **ID de la extensión** y al perfil de Chrome. Si se carga otra copia desde una carpeta diferente, no tendrá acceso automático a la base de la instalación anterior.

## Verificación y límites

Se probaron localmente seis regresiones preexistentes y nuevas: lectura de listados, ZIP, fallo HTTP 403, procesamiento incremental, 112 videos distribuidos en 32+32+32+16, migración de 24 transcripciones + 8 videos fallidos, y detección de un listado visual que no avanza. En la simulación de la migración, los 80 videos restantes se transcribieron sin volver a solicitar los 24 ya terminados.

**Estas son pruebas con respuestas simuladas, no una confirmación de que un canal real devolverá todos los videos.** YouTube puede modificar los formatos o restringir su acceso. Si se muestra «Exploración incompleta», abre «Diagnóstico técnico de solicitudes y errores», pulsa «Copiar diagnóstico» y compártelo para localizar el endpoint y el paso fallidos. El diagnóstico no incluye claves ni transcripciones.
