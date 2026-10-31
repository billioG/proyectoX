# Importar preguntas de un cuestionario desde JSON

Dónde: **Cursos → Administrar curso → Agregar recurso → Cuestionario con nota (Quiz)** →
**Importar preguntas desde un archivo JSON** (subir el archivo o pegar el texto).

Código: `js/quiz-import.js` (formato y validación) y `js/lessons.js` (botones).
Pruebas: `npm run test:unit`.

## Formato

```json
{
  "preguntas": [
    { "tipo": "mc", "pregunta": "¿Cuál es la capital de Guatemala?",
      "opciones": ["Quetzaltenango", "Ciudad de Guatemala", "Antigua Guatemala", "Cobán"], "correcta": "B" },
    { "tipo": "tf", "pregunta": "El quetzal es el ave nacional de Guatemala.", "correcta": true },
    { "tipo": "number", "pregunta": "¿Cuánto es 7 × 8?", "correcta": 56, "tolerancia": 0 },
    { "tipo": "range", "pregunta": "¿En qué año? (acepta 1820 a 1822)", "min": 1820, "max": 1822 },
    { "tipo": "text", "pregunta": "Explica por qué es importante cuidar el agua." }
  ]
}
```

| Tipo | Campos | Notas |
|---|---|---|
| `mc` (opción múltiple) | `pregunta`, `opciones` (2 a 8), `correcta` | `correcta` es la **letra** (`"B"`), el **texto** de la opción (sin importar tildes ni mayúsculas) o un número desde **1** (1 = primera opción). |
| `tf` (verdadero/falso) | `pregunta`, `correcta` | `true`/`false`, `"verdadero"`/`"falso"`, `"V"`/`"F"`, `"sí"`/`"no"`. |
| `number` (número exacto) | `pregunta`, `correcta`, `tolerancia` (opcional, por defecto 0) | Acepta coma decimal (`"3,5"`). |
| `range` (rango) | `pregunta`, `min`, `max` | Cualquier número entre `min` y `max` es correcto. |
| `text` (respuesta abierta) | `pregunta` | La califica el docente; no suma a la nota automática. |

También se aceptan:

- Una **lista suelta** `[ {...}, {...} ]` en vez del objeto con `"preguntas"`.
- Los nombres del tipo en español (`"Opción múltiple"`, `"Verdadero/Falso"`, `"abierta"`...).
- Las llaves internas en inglés (`type`, `question`, `options`, `correctIndex` desde 0, `correctBool`,
  `correctNumber`, `tolerance`).
- Sin `tipo`, se deduce solo si no hay duda (con `opciones` es opción múltiple; `correcta: true` es verdadero/falso...).
- Texto pegado con vallas \`\`\`json (como lo entregan ChatGPT o Gemini) y archivos con BOM.

## Reglas

- **Todo o nada:** si cualquier pregunta tiene un error no se importa ninguna y se muestra la lista de errores.
- Máximo 100 preguntas por cuestionario (contando las que ya tenía), 2000 caracteres por pregunta,
  500 por opción, archivo de hasta 1 MB, codificación UTF-8.
- Las preguntas importadas se **agregan al final**; el docente las revisa en el constructor antes de guardar.
- El texto se limpia de caracteres de control. El HTML no se interpreta: la app lo escapa al mostrarlo.

## Para pedírselo a una IA

El botón **Instrucciones para IA** copia un texto listo para pegar en ChatGPT, Gemini u otro asistente
(cambiando `[TEMA]` y `[GRADO]`) que le pide la respuesta solo en este formato.
