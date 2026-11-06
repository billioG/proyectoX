# Soporte y onboarding

Material para que un docente nuevo arranque solo y para que quien atienda dudas responda rápido. Todo vive en el repositorio (nada de herramientas externas).

| Documento | Para quién | Qué es |
|---|---|---|
| [`KIT_ONBOARDING_DOCENTE.md`](KIT_ONBOARDING_DOCENTE.md) | Docente nuevo | 3 acciones en 15 minutos: **entrar, pasar lista, proyectos** (+ qué dice el indicador de sincronización y una lista de la primera semana) |
| [`PREGUNTAS_FRECUENTES_DOCENTES.md`](PREGUNTAS_FRECUENTES_DOCENTES.md) | Docente y soporte | Los **10 problemas** más comunes con su solución en pasos |
| [`GUIA_RAPIDA_SOPORTE.md`](GUIA_RAPIDA_SOPORTE.md) | Quien atiende dudas | Reglas, 5 preguntas iniciales, diagnóstico por síntoma, dónde mirar y **qué mandar al escalar** |
| [`TEXTOS_EN_LA_APP.md`](TEXTOS_EN_LA_APP.md) | Quien mantiene la app | Guía de estilo de mensajes, lo ya cambiado en la app, lo pendiente y cómo agregar ayuda o un mensaje |

## Dentro de la app

- Botones **Ayuda** en: entrada, **Tomar Asistencia** y **Subir Proyecto** (más el tema `sincronizacion`, para usar donde haga falta).
- Avisos de error con **qué pasó y qué hacer** (cámara, QR, proyecto, ingreso).
- Todo el texto está en **`js/help-messages.js`**.

## Cómo mantenerlo

1. Cuando cambie un flujo (menú, botón, mensaje), actualiza **el texto de `js/help-messages.js`** y **los documentos de esta carpeta que lo nombren**.
2. La prueba `tests-unit/help-messages.test.mjs` falla si: la guía promete un tema de ayuda que no existe, hay menos de 10 preguntas, o un documento menciona un nombre de menú que ya no está en `index.html`.
3. Revisión sugerida: **cada trimestre**, o cuando salga una versión que cambie un menú.

> Estos documentos se escribieron a partir del código de la v1.0.228, **no de consultas reales de docentes**: las 10 preguntas son las que el recorrido de los flujos
> y los avisos de error hacen más probables. Reordénalas cuando haya datos.
