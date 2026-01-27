# BiBlion

Aplicación de escritorio para gestión de biblioteca personal con escáner móvil integrado.

## Requisitos previos

Debes tener **Node.js** instalado en tu computadora para ejecutar este proyecto.
Si no lo tienes, descárgalo e instálalo desde: https://nodejs.org/

## Instalación

1.  Abre una terminal en esta carpeta.
2.  Ejecuta el siguiente comando para instalar las dependencias:

    ```bash
    npm install
    ```

## Ejecución

Para iniciar la aplicación en modo desarrollo:

```bash
npm run dev
```

Esto abrirá la ventana de escritorio y el servidor local.
En la parte superior de la aplicación verás la URL para conectar tu celular (ej: `http://192.168.1.15:3000`).

## Estructura de Datos

Los datos se guardan automáticamente en la carpeta `db_biblion` en la raíz del proyecto.
- `books.json`: Base de datos de libros.
- `covers/`: Imágenes de portada (pendiente de implementación completa de descarga).
- `backups/`: Copias de seguridad automáticas.

## Uso Móvil

1.  Asegúrate que tu celular esté en la misma red WiFi que tu PC.
2.  Ingresa a la URL mostrada en la App de Desktop.
3.  Permite el acceso a la cámara.
4.  Escanea el código de barras (ISBN) de un libro.
5.  Confirma los datos para guardarlo en tu biblioteca.
