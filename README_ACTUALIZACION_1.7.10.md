# YouTube Transcript v1.7.10 — idioma original

## Qué cambia
- **Auto** ya no selecciona las pistas de subtítulos según el idioma de Chrome/YouTube.
- Prioriza el idioma original de cada video cuando los metadatos de YouTube permiten identificarlo.
- Si están disponibles, da prioridad a los subtítulos manuales en el idioma original y, si no, a los automáticos.
- Reconoce pistas de audio original cuando YouTube incluye su marca `original` dentro de `xtags`; también contempla `defaultAudioLanguage` y pistas ASR en videos sin doblaje.
- Evita sustituir silenciosamente la pista seleccionada por otra lengua cuando falla una petición de subtítulos.
- Respeta una selección manual de idioma que el usuario haya establecido previamente en los ajustes de la extensión.
- Mantiene el menú de tres puntos de Inicio introducido en 1.7.9.

## Qué hacer
1. Copia el contenido de `parche/` a la carpeta de tu extensión v1.7.9, reemplazando archivos.
2. En `chrome://extensions`, pulsa **Recargar**; comprueba que diga 1.7.10.
3. Recarga YouTube (Ctrl+R).
4. En los ajustes de la propia extensión, asegúrate de que **Transcript language** sea **Auto** (no Spanish ni English).
5. Prueba un video originalmente en español que también tenga subtítulos en inglés, y otro originalmente en inglés.

## Limitaciones
- YouTube no ofrece siempre una etiqueta inequívoca del idioma original; si no hay metadatos suficientes se aplican heurísticas.
- Algunos videos solo tienen subtítulos traducidos o doblados. La extensión no hace reconocimiento de voz local ni traduce el audio.
- La respuesta interna del reproductor de YouTube no es una API pública estable; puede cambiar.
- Si fallan las peticiones de subtítulos del idioma original, ahora se prefiere indicar error antes que copiar una transcripción en un idioma diferente silenciosamente.
- Las pruebas locales NO equivalen a una validación contra YouTube real desde tu cuenta y sesión.
