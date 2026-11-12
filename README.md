# Editor de vídeo para el aula

Editor de vídeo que funciona entero en el navegador, al estilo de Clipchamp o CapCut, pensado para alumnado de 1.º de Bachillerato. No necesita servidor ni base de datos: los vídeos **no se suben a internet**, todo se procesa y se guarda en el ordenador de cada estudiante.

## Qué incluye

- **Multimedia:** importar vídeo, audio e imágenes (arrastrar y soltar), miniaturas y forma de onda.
- **Línea de tiempo:** varias pistas de vídeo/audio, arrastrar, recortar bordes, dividir (S), duplicar, copiar/pegar, imán, zoom, bloquear/ocultar/silenciar pistas, deshacer/rehacer.
- **Vista previa:** mover, escalar y girar elementos directamente sobre el vídeo, con guías de centrado.
- **Texto:** 12 estilos (título, rótulo inferior, cómic, neón, máquina de escribir…), 24 fuentes, contorno, sombra, fondo.
- **Subtítulos:** pista propia con estilo común, importar/exportar SRT y **dictado automático** con la voz.
- **Animaciones:** entrada, salida y continuas (zoom lento, latido, flotar…) y **fotogramas clave** de posición, escala, rotación y opacidad.
- **Transiciones** entre clips (15 tipos) y **filtros** (16 + ajustes de brillo, contraste, temperatura, viñeta…).
- **Croma** (fondo verde/azul) con cuentagotas, velocidad (0,1×–8×), congelar fotograma, recortar bordes, voltear, modos de fusión.
- **Audio:** volumen hasta 200 %, fundidos, separar el audio del vídeo y 13 efectos de sonido propios (sin derechos).
- **Grabar:** pantalla, cámara, pantalla + cámara (en círculo) y voz en off sobre el vídeo.
- **Formatos:** 16:9, 9:16, 1:1, 4:3 y 4:5, con fondo de color o desenfocado.
- **Exportar** a MP4 (H.264) de 480p a 1080p con aceleración por hardware, además de WAV, PNG y SRT.
- **Guardado:** se guarda solo en el navegador y se puede descargar un archivo `.vproj` para continuar en otro ordenador.

## Requisitos

- **Google Chrome o Microsoft Edge** actualizados (para exportar se usan WebCodecs; Firefox y Safari no sirven para exportar).
- Ordenador con 8 GB de RAM o más (un i3 de 12.ª generación con 16 GB va sobrado para 1080p).
- La página tiene que abrirse desde una dirección web (`https://…`). **No funciona** si se abre `index.html` con doble clic.

## Publicarlo (elige una opción)

### Opción A: Netlify (la más sencilla, unos 3 minutos)

1. Crea una cuenta gratuita en <https://app.netlify.com/signup> (con Google o GitHub).
2. Entra en <https://app.netlify.com/drop>.
3. Descomprime el ZIP y **arrastra la carpeta `editor-video`** (la que contiene `index.html`) a la página.
4. En unos segundos tendrás una dirección del tipo `https://nombre-raro-123.netlify.app`. En *Site configuration → Change site name* puedes cambiarla por algo como `https://editor-1bach.netlify.app`.
5. Ese es el enlace para tus estudiantes.

> Importante: sin iniciar sesión, Netlify borra el sitio al cabo de una hora. Con la cuenta creada, se queda publicado.

Para actualizarlo más adelante: *Deploys* → arrastra de nuevo la carpeta.

### Opción B: GitHub Pages

1. Crea un repositorio público en GitHub (por ejemplo `editor-video`).
2. Pulsa *Add file → Upload files* y sube **el contenido** de la carpeta (`index.html`, `css/`, `js/`, `lib/`, `.nojekyll`).
3. Ve a *Settings → Pages*, en *Source* elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`. Guarda.
4. Al cabo de un minuto estará en `https://TU-USUARIO.github.io/editor-video/`.

### Probarlo en tu ordenador sin publicarlo

Con Python instalado, abre una terminal dentro de la carpeta y ejecuta `python -m http.server 8000`. Después abre <http://localhost:8000>.

## Notas para el profesorado

- **Dónde se guardan los proyectos:** en el almacenamiento del navegador de cada ordenador y usuario. Si en el centro se borran los perfiles al cerrar sesión, pide al alumnado que pulse **«Guardar archivo»** al acabar cada sesión y que guarde el `.vproj` en su nube o pendrive. Desde la pantalla de inicio lo abren con **«Abrir archivo de proyecto»**.
- **Privacidad:** los vídeos no salen del ordenador. La única excepción son los **subtítulos automáticos por voz**: Chrome envía el audio del micrófono a los servidores de Google para transcribirlo, y solo mientras esa opción está activada.
- **Formatos recomendados:** MP4 (H.264), MP3/WAV/M4A, JPG/PNG. Los vídeos de móvil (incluidos los verticales) funcionan. Algunos `.mov` de iPhone en HEVC pueden no abrirse en ordenadores sin soporte de HEVC: en ese caso, que graben en «Más compatible» (Ajustes → Cámara → Formatos).
- **Velocidad de exportación:** los MP4 normales (de móvil o cámara) se decodifican y codifican con aceleración por hardware, así que la exportación suele ir más rápida que el propio vídeo. Las grabaciones hechas dentro del editor y algunos formatos raros usan un método más lento. El MP4 se guarda en la carpeta Descargas.
- **Música:** recuérdales que usen música libre de derechos (por ejemplo, la biblioteca de audio de YouTube) si van a publicar los vídeos.

## Estructura

```
index.html        Página principal
css/styles.css    Estilos
js/               Código del editor (módulos ES, sin compilación)
lib/              mp4-muxer (MIT) y mp4box.js (BSD-3) para MP4
```

Iconos: Lucide (ISC). Fuentes: Google Fonts (OFL).
