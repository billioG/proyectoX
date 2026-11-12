# Respaldo y restauración del nodo escolar

Qué se respalda, cómo se hace solo, cómo se hace a mano y cómo se recupera un nodo. Pensado para quien administra la
Raspberry de una escuela, sin necesidad de saber de bases de datos.

> **Resumen.** Cada noche, a las 2:30, el nodo guarda una copia de su base en `data/backups` y se queda con las 14 más
> recientes. Si hay una memoria USB conectada, copia también ahí. Para recuperar un nodo se detiene el servicio, se corre
> un comando con el archivo del respaldo y se vuelve a arrancar.

## 1. Qué hay que cuidar (y qué no)

| Dato | Dónde vive | ¿Se pierde si muere la microSD? |
|---|---|---|
| Estudiantes, cursos, avance y recursos **ya sincronizados** | Nube (Supabase) y copia en el nodo | **No**: se vuelve a bajar al sincronizar |
| Avance, PIN, evaluaciones, asistencia, retos, etc. **hechos en el nodo y todavía sin subir** | `data/node.db` | **Sí**, hasta que se sincronicen |
| Proyectos (videos/modelos 3D) y fotos subidos **y todavía sin subir** | `data/projects`, `data/project-uploads`, `data/photos` | **Sí** |
| PIN de estudiantes y docentes del nodo (solo en el modo anterior, `/?modo=pin`) | `data/node.db` | Sí (se pueden volver a crear, pero tendrían que elegir PIN otra vez). Con la app real, estudiantes y docentes entran con la contraseña de clase y la de su cuenta, que se vuelven a bajar al sincronizar |
| Token del nodo y código de docente | `config.json` | Sí (el token se vuelve a copiar del panel de Servidores; el código de docente se genera nuevo) |
| Cursos y videos descargados | `data/content` | No: se vuelven a bajar |

**Conclusión práctica:** lo único insustituible es lo que pasó en el nodo **desde la última sincronización**. Por eso
dos hábitos valen más que cualquier respaldo: (1) que el nodo sincronice seguido (`pending_changes` en `0`, mira el
chip de estado o `http://quetzal.local/api/node/status`) y (2) tener el respaldo diario revisado.

## 2. Respaldo automático

Lo instala `install.sh` (también al actualizar con `bash ~/quetzal/school-node/install.sh --update`, así que los nodos
que ya existían lo reciben al actualizar). Es un temporizador de systemd:

- Corre todos los días a las **2:30** (con hasta 10 minutos de diferencia). Si la Raspberry estaba apagada a esa hora,
  lo hace al encender.
- Guarda `data/backups/node-AAAAMMDD-HHMMSS.db` y borra los más antiguos: se quedan **14**.
- Si hay una **memoria USB conectada**, copia también a `quetzal-respaldos/` dentro de la memoria.
- No hace falta apagar el servidor: el respaldo se hace con la función de copia de SQLite, que es consistente con el
  servidor funcionando.

Comprobar que está activo:

```bash
systemctl list-timers quetzal-backup.timer      # debe mostrar la próxima vez que corre
sudo systemctl start quetzal-backup.service     # hacer uno ahora, a través del servicio
journalctl -u quetzal-backup.service -n 20      # qué dijo la última vez
```

> **Un respaldo en la misma microSD no protege de una microSD dañada.** Es útil contra errores (alguien borra algo, una
> actualización sale mal), pero no contra la tarjeta muerta. Por eso se copia a la USB. **Una vez al mes, deja la USB
> conectada y llévate una copia** (ver sección 4).

## 3. Respaldo a mano

Con SSH (o teclado) en la Raspberry:

```bash
cd ~/quetzal/school-node
node backup.js                                  # a data/backups
node backup.js --out /media/quetzal-usb/respaldos --keep 30     # a la USB, dejando 30
node backup.js --files                          # además, un .tar.gz con proyectos y fotos todavía sin subir
node backup.js --list                           # lista los que hay
```

Haz uno a mano **antes** de: actualizar el nodo, cambiar de microSD, mover la Raspberry a otra escuela o restaurar algo.
`--files` solo guarda lo que no se puede volver a bajar (`projects`, `project-uploads`, `photos`, la llave de la USB);
los cursos y videos descargados no entran porque se bajan de nuevo.

El respaldo se revisa al terminar (integridad de la base y que sea una base del nodo); si no pasa la revisión, no queda
guardado y el comando dice por qué.

## 4. Sacar una copia fuera de la Raspberry

Elige una:

- **Memoria USB.** Con la USB conectada, `node backup.js --out /media/quetzal-usb/respaldos` (o espera a la copia
  automática de la noche). Desconéctala con calma (`sudo umount /media/quetzal-usb`) y guárdala.
- **Por la red, desde tu computadora:**
  ```bash
  scp TU_USUARIO@quetzal.local:~/quetzal/school-node/data/backups/node-*.db .
  ```
- Los respaldos contienen **datos de estudiantes**: guárdalos como cualquier lista de alumnos (no en chats ni correos
  abiertos). No contienen el token del nodo (eso está en `config.json`, que no se respalda a propósito).

## 5. Restaurar

### 5.1 En el mismo nodo (algo salió mal, quieres volver atrás)

```bash
cd ~/quetzal/school-node
node backup.js --list                            # elige el respaldo
sudo systemctl stop quetzal-node                 # IMPRESCINDIBLE: con el servicio encendido la base está abierta
node backup.js --restore data/backups/node-20261104-023000.db
sudo systemctl start quetzal-node
```

- El comando **revisa el archivo antes de tocar nada** (si está dañado o no es una base del nodo, se detiene y no cambia
  nada).
- La base que estaba **no se borra**: queda como `data/node.db.antes-de-restaurar-AAAAMMDD-HHMMSS`. Si te equivocaste de
  archivo, detén el servicio, devuelve ese archivo a `node.db` y arranca de nuevo.
- Si el servicio sigue encendido, el comando se niega y te dice qué ejecutar.
- Se pierde lo ocurrido **después** del respaldo que elijas. Elige el más reciente que tenga sentido.

Después de restaurar, comprueba: entra a `http://quetzal.local`, abre `http://quetzal.local/api/node/status` y mira que
`pending_changes` se vea razonable, y deja que sincronice con internet (el chip de estado lo muestra).

### 5.2 En una Raspberry nueva o microSD nueva (la anterior murió)

1. Instala el nodo en la nueva (un comando, ver `school-node/README.md`) o clona la imagen (`docs/NODO_IMAGEN_MICROSD.md`).
   Usa el **token del mismo nodo** (panel de Servidores en Quetzal) para que siga siendo el mismo servidor de la escuela.
2. Copia el respaldo a la nueva Raspberry (`scp` o USB) y restáuralo como en 5.1 (con el servicio detenido).
3. Si tienes el `.tar.gz` de `--files`, descomprímelo dentro de `data/`:
   `tar -xzf node-AAAAMMDD-HHMMSS-archivos.tar.gz -C ~/quetzal/school-node/data`
4. Arranca el servicio y deja sincronizar.

**Si no tienes ningún respaldo:** el nodo vuelve a bajar de la nube estudiantes, cursos y avance sincronizado en la
primera sincronización. Lo que se hizo sin conexión y no se había subido se perdió; si la escuela usaba el modo anterior
(PIN), los estudiantes tendrán que crear su PIN otra vez.

**Si cambias de Raspberry** y la escuela usa el kit de router, el servidor de nombres viene con el nodo (desde v1.0.265),
pero la reserva de IP del router es por dirección MAC: hay que reservar la IP de la Raspberry nueva y comprobar que el
router la siga entregando como DNS (`docs/NODO_KIT_ROUTER.md`, secciones 2 y 3).

### 5.3 Windows

El nodo de Windows guarda `config.json` y `data\` en `C:\Quetzal` (variable `QUETZAL_CONFIG_DIR`). El mismo
`backup.js` funciona ahí, desde la carpeta `school-node` del programa:

```powershell
$env:QUETZAL_CONFIG_DIR = "C:\Quetzal"
node backup.js
```

El respaldo diario automático **solo lo instala el instalador de Raspberry/Linux**; en Windows hay que programar esa
línea con el Programador de tareas, o copiar a mano la carpeta `C:\Quetzal\data\backups`.

## 6. Prueba de restauración (cada trimestre)

Un respaldo que nunca se restauró es una esperanza, no un respaldo. Una vez por trimestre, en una Raspberry de prueba (o
en tu computadora con el nodo instalado):

1. Restaura el último respaldo de una escuela real con los pasos de 5.1.
2. Entra a `http://quetzal.local`, inicia sesión con un estudiante de prueba y abre un curso.
3. Anota la fecha y el resultado en la lista de `docs/CHECKLIST_NUEVO_COLEGIO.md` (sección «Mantenimiento»).

## 7. Si algo falla

| Síntoma | Causa | Qué hacer |
|---|---|---|
| `No hay base en .../node.db` | El nodo nunca arrancó o `dataDir` apunta a otro lado | Arranca el servicio una vez; revisa `dataDir` en `config.json` |
| `El respaldo no pasó la revisión` | La base estaba dañada (corte de luz grave, microSD fallando) | Cambia la microSD pronto; usa el respaldo anterior |
| `Detén primero el servicio` | Intentaste restaurar con el nodo encendido | `sudo systemctl stop quetzal-node` y repite |
| `Ese archivo no sirve para restaurar` | Archivo dañado o no es un respaldo del nodo | Prueba con el anterior; revisa `--list` |
| El temporizador no aparece en `list-timers` | Nodo instalado antes de esta versión | `bash ~/quetzal/school-node/install.sh --update` (desde v1.0.266 funciona aunque el nodo tenga cambios locales) |
| No hay copia en la USB | La USB no estaba conectada a las 2:30 | Conéctala y corre `sudo systemctl start quetzal-backup.service` |
