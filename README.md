# 🚀 ProjectX - Guía de Interpretación de Métricas Administrativas

Esta guía explica detalladamente la lógica, el uso y la interpretación de los números que alimentan el panel administrativo de ProjectX.

---

## 🎯 1. Centro de Fidelización (Customer Success Hub)
Este módulo mide la **salud operativa** de cada colegio basada en su capacidad de producción tecnológica.

### 🧮 ¿De dónde salen los números?
*   **Meta Bimestral:** El sistema calcula cuántos equipos "ideales" (de 3.5 alumnos) debería tener el colegio y espera que cada equipo entregue **4 proyectos por bimestre**.
    *   *Fórmula:* `(Total de Alumnos / 3.5) * 4`.
*   **Salud (% de la meta):** Compara los proyectos entregados contra la meta bimestral.
    *   *Fórmula:* `(Proyectos Actuales / Meta Bimestral) * 100`.
*   **Próxima Sesión (Sugerencia):** Se calcula automáticamente según la salud:
    *   **Crítico (<40%):** Agendar en **3 días** (Intervención urgente).
    *   **Medio (40-79%):** Agendar en **7 días** (Seguimiento estándar).
    *   **Excelente (>80%):** Agendar en **15 días** (Mantenimiento de éxito).

### 💡 Cómo usarlo:
*   Utiliza el botón **"Reporte"** para generar un PDF ejecutivo para los directores.
*   Utiliza el **"Mapa"** para ver los videos de los proyectos con mejor punteo y usarlos como casos de éxito.

---

## 📊 2. Analítica de Asistencia Global
Mide la **consistencia de la participación** de los estudiantes en el programa.

### 🧮 ¿De dónde salen los números?
*   **Tasa de Asistencia Global (Real):** No es solo un conteo de registros, es un ratio de cumplimiento.
    *   *Fórmula:* `(Presentes + Tardes) / (Total de Estudiantes * Cantidad de Días que se pasó asistencia)`.
*   **Asistencias Totales:** Suma de todos los estados `present` (presente) capturados por el escáner QR.
*   **Tardanzas:** Suma de estados `late`.
*   **Ausencias:** Suma de estados `absent`.

### 💡 Cómo interpretarlo:
*   Si un colegio tiene 35 alumnos y solo escaneaste a 3, aunque los 3 estén presentes, la tasa será del **8.5%**. Esto indica que el docente aún no ha terminado de pasar asistencia a todo el grupo.

---

## 📈 3. Resumen de Resultados Académicos
Mide la **calidad del aprendizaje** y el avance del docente en su labor evaluativa.

### 🧮 ¿De dónde salen los números?
*   **Promedio General:** Es la media aritmética de todos los proyectos que tienen una nota asignada.
    *   *Fórmula:* `Suma de Scores / Cantidad de Proyectos con Score > 0`.
*   **Progreso (%):** Indica qué porcentaje de los proyectos subidos ya han sido revisados y calificados.
    *   *Fórmula:* `(Proyectos con Nota / Total de Proyectos Subidos) * 100`.
*   **Pendientes:** Proyectos que están en el sistema pero tienen nota 0 o vacía.

### 💡 Niveles de Desempeño:
*   **Sobresaliente (90-100):** Excelencia académica.
*   **Satisfactorio (75-89):** Cumple con los objetivos de aprendizaje.
*   **Necesita Mejora (<75):** Requiere refuerzo pedagógico.

---

## 👨‍🏫 4. Desempeño Docente (Dashboard Principal)
Mide el **compromiso y satisfacción** de los líderes educativos.

### 🧮 ¿De dónde salen los números?
*   **Calificación Stu.:** Promedio de las estrellas (1-5) que los alumnos le dan a su docente semanalmente.
*   **Alertas de Salud (Churn):** Colegios que llevan más de **15 días sin subir un solo proyecto** o tienen una producción mínima histórica.
*   **Satisfacción Docente:** Un cruce entre la nota de los alumnos y la cantidad de proyectos que el docente ha calificado (volumen de trabajo).

---

## 🛠️ Buenas Prácticas de Uso
1.  **Limpieza de Caché:** Siempre que realices cambios masivos en alumnos o escuelas, refresca la página para que el sistema recalcule las metas bimestrales.
2.  **Reporte Ejecutivo:** Imprime este reporte para las reuniones mensuales con directores; los datos de "Impacto Social" y "Creatividad" son los que más valor generan para el colegio.
3.  **Monitoreo Real-Time:** El Dashboard se actualiza al instante cada vez que un alumno sube un video o un docente califica.
