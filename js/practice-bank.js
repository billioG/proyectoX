/**
 * BANCO DE PRÁCTICA (sin conexión) -- ejercicios guardados en el dispositivo
 * para el modo Práctica cuando NO hay internet o la IA no responde. Con
 * conexión, la práctica siempre se genera con la IA (ver practice.js); esto es
 * solo el respaldo, y por eso es chico y sencillo.
 *
 * Los retos contra un compañero NO usan este archivo: ahí el contenido sale de
 * la IA (o del banco del servidor) y nunca viaja al cliente antes de jugar. Las
 * palabras de acá son otras distintas a las del banco del servidor
 * (migrations/hangman-word-bank.sql), así que mirar este archivo no sirve para
 * hacer trampa en un reto.
 *
 * Formato de cada juego:
 *   hangman : { word (A-Z, sin tildes), hint, fact }
 *   spelling: { word (con tildes), hint (con _____), fact }
 *   debug   : { steps: [{ label, isBug, explanation }] , fact }  -- UNA sola isBug
 *   reading : { title, passage, questions: [{ question, options[4], correctIndex }], fact }
 */

window.PRACTICE_BANK = {
  hangman: [
    { word: 'PLANETA', hint: 'Cuerpo grande que gira alrededor del Sol, como la Tierra.', fact: 'El Sistema Solar tiene ocho planetas; Júpiter es el más grande.' },
    { word: 'GRAVEDAD', hint: 'Fuerza que atrae los objetos hacia el centro de la Tierra.', fact: 'La gravedad de la Luna es unas seis veces menor que la de la Tierra.' },
    { word: 'OXIGENO', hint: 'Gas del aire que necesitamos para respirar.', fact: 'Las plantas producen oxígeno durante la fotosíntesis.' },
    { word: 'FOTOSINTESIS', hint: 'Proceso con el que las plantas fabrican su alimento usando la luz.', fact: 'En la fotosíntesis las plantas toman dióxido de carbono y liberan oxígeno.' },
    { word: 'CELULA', hint: 'La unidad más pequeña que forma a los seres vivos.', fact: 'Un cuerpo humano adulto tiene decenas de billones de células.' },
    { word: 'ELECTRICIDAD', hint: 'Energía que hace funcionar los focos, la radio y el celular.', fact: 'Un rayo es una descarga enorme de electricidad.' },
    { word: 'IMAN', hint: 'Objeto que atrae el hierro.', fact: 'La Tierra se comporta como un gran imán, y por eso funciona la brújula.' },
    { word: 'EVAPORACION', hint: 'Paso del agua de líquido a vapor por el calor.', fact: 'La evaporación es una de las etapas del ciclo del agua.' },
    { word: 'CLIMA', hint: 'Comportamiento del tiempo atmosférico durante muchos años.', fact: 'El tiempo es lo que pasa hoy; el clima es lo que suele pasar durante años.' },
    { word: 'FRACCION', hint: 'Número que representa una parte de un entero, como un medio.', fact: 'En la fracción 3/4, el 4 indica en cuántas partes iguales se dividió el entero.' },
    { word: 'TRIANGULO', hint: 'Figura de tres lados.', fact: 'Los ángulos de cualquier triángulo suman 180 grados.' },
    { word: 'PERIMETRO', hint: 'Suma de la longitud de todos los lados de una figura.', fact: 'Para saber cuánta cerca necesitas para un terreno, calculas su perímetro.' },
    { word: 'PROMEDIO', hint: 'Resultado de sumar varios datos y dividir entre cuántos son.', fact: 'El promedio de 4, 6 y 8 es 6.' },
    { word: 'PORCENTAJE', hint: 'Cantidad expresada como parte de cada cien.', fact: 'El 50 por ciento de una cantidad es lo mismo que su mitad.' },
    { word: 'VITAMINA', hint: 'Sustancia de las frutas y verduras que ayuda al cuerpo a funcionar bien.', fact: 'La vitamina C, que tienen la naranja y el limón, ayuda a las defensas del cuerpo.' },
    { word: 'HIGIENE', hint: 'Hábitos de limpieza que cuidan la salud.', fact: 'Lavarse las manos con agua y jabón ayuda a prevenir muchas enfermedades.' },
    { word: 'PROTEINA', hint: 'Nutriente de los huevos, los frijoles y la carne que ayuda a formar músculos.', fact: 'Los frijoles son una buena fuente de proteína de origen vegetal.' },
    { word: 'CORAZON', hint: 'Órgano que bombea la sangre por todo el cuerpo.', fact: 'En reposo, el corazón de un adulto late entre 60 y 100 veces por minuto.' },
    { word: 'PULMONES', hint: 'Órganos con los que respiramos.', fact: 'Los pulmones pasan el oxígeno del aire a la sangre.' },
    { word: 'RESPETO', hint: 'Valor de tratar bien a los demás y aceptar que piensen distinto.', fact: 'Escuchar sin interrumpir es una forma sencilla de mostrar respeto.' },
    { word: 'SOLIDARIDAD', hint: 'Ayudar a otras personas que lo necesitan.', fact: 'Cuando una comunidad se organiza para ayudar, el esfuerzo rinde mucho más.' },
    { word: 'HONESTIDAD', hint: 'Decir la verdad y actuar con rectitud.', fact: 'Devolver algo que no es tuyo es un acto de honestidad.' },
    { word: 'DEMOCRACIA', hint: 'Forma de gobierno en la que el pueblo elige a sus autoridades.', fact: 'En Guatemala se vota para elegir presidente, diputados y alcaldes.' },
    { word: 'CONSTITUCION', hint: 'La ley más importante de un país.', fact: 'La Constitución establece los derechos y los deberes de las personas.' },
    { word: 'MARIMBA', hint: 'Instrumento de teclas de madera que simboliza la música de Guatemala.', fact: 'La marimba se toca con baquetas y acompaña fiestas en todo el país.' },
    { word: 'HUIPIL', hint: 'Blusa tradicional bordada que visten muchas mujeres mayas.', fact: 'Los bordados de un huipil suelen indicar de qué comunidad es quien lo usa.' },
    { word: 'TIKAL', hint: 'Antigua ciudad maya de Petén con grandes pirámides.', fact: 'Tikal es Patrimonio de la Humanidad de la UNESCO.' },
    { word: 'TAMAL', hint: 'Masa de maíz envuelta en hojas y cocida al vapor.', fact: 'El maíz es la base de la alimentación y de la cultura maya.' },
    { word: 'MAIZ', hint: 'Cereal con el que se hacen las tortillas y los tamales.', fact: 'Según el Popol Vuh, los seres humanos fueron formados de maíz.' },
    { word: 'POPOLVUH', hint: 'Libro sagrado de los mayas k\'iche\'.', fact: 'El Popol Vuh cuenta el origen del mundo según la tradición k\'iche\'.' },
    { word: 'INTERNET', hint: 'Red mundial que conecta computadoras y celulares.', fact: 'Antes de compartir una noticia, conviene comprobar que la fuente sea confiable.' },
    { word: 'ADJETIVO', hint: 'Palabra que dice cómo es un sustantivo.', fact: 'En "casa grande", la palabra "grande" es el adjetivo.' },
    { word: 'VERBO', hint: 'Palabra que expresa una acción.', fact: 'Correr, leer y cantar son verbos.' },
    { word: 'SILABA', hint: 'Grupo de letras que se pronuncia en un solo golpe de voz.', fact: 'La palabra "mariposa" tiene cuatro sílabas: ma-ri-po-sa.' },
    { word: 'SINONIMO', hint: 'Palabra con significado parecido al de otra.', fact: 'Contento y alegre son sinónimos.' },
    { word: 'ANTONIMO', hint: 'Palabra con significado contrario al de otra.', fact: 'Alto y bajo son antónimos.' },
    { word: 'METAFORA', hint: 'Recurso que compara dos cosas sin usar "como", por ejemplo "tus ojos son estrellas".', fact: 'Las metáforas se usan mucho en la poesía y en las canciones.' },
    { word: 'CALENDARIO', hint: 'Sistema que organiza los días, las semanas y los meses.', fact: 'Los mayas usaron calendarios muy precisos para medir el tiempo.' },
  ],

  spelling: [
    { word: 'murciélago', hint: 'De noche, el _____ sale a cazar insectos.', fact: 'Murciélago es esdrújula, y todas las palabras esdrújulas llevan tilde.' },
    { word: 'árbol', hint: 'La ceiba es un _____ muy alto y frondoso.', fact: 'Árbol es llana y no termina en n, s ni vocal, por eso lleva tilde.' },
    { word: 'teléfono', hint: 'Llamé por _____ a mi abuela.', fact: 'Teléfono es esdrújula: lleva tilde en la antepenúltima sílaba.' },
    { word: 'página', hint: 'Lee la _____ cinco del libro.', fact: 'Página es esdrújula y siempre lleva tilde.' },
    { word: 'cámara', hint: 'Tomó la foto con la _____ del celular.', fact: 'Cámara es esdrújula y lleva tilde.' },
    { word: 'música', hint: 'La _____ de la marimba alegra la fiesta.', fact: 'Música es esdrújula y lleva tilde.' },
    { word: 'número', hint: 'El 7 es un _____ primo.', fact: 'Número es esdrújula y lleva tilde.' },
    { word: 'también', hint: 'Ana vino a la fiesta y _____ su hermano.', fact: 'También es aguda y termina en n, por eso lleva tilde.' },
    { word: 'canción', hint: 'Aprendimos una _____ para el acto cívico.', fact: 'Canción es aguda y termina en n, por eso lleva tilde.' },
    { word: 'avión', hint: 'El _____ aterrizó en el aeropuerto La Aurora.', fact: 'Avión es aguda terminada en n: lleva tilde.' },
    { word: 'lección', hint: 'Hoy la _____ de ciencias trata sobre el agua.', fact: 'Lección es aguda terminada en n: lleva tilde.' },
    { word: 'volcán', hint: 'El _____ de Fuego se ve desde Antigua Guatemala.', fact: 'Volcán es aguda terminada en n: lleva tilde.' },
    { word: 'ratón', hint: 'El _____ se escondió en su cueva.', fact: 'Ratón es aguda terminada en n: lleva tilde.' },
    { word: 'país', hint: 'Guatemala es un _____ de Centroamérica.', fact: 'País lleva tilde para separar la i de la a (pa-ís).' },
    { word: 'lápiz', hint: 'Escribí mi tarea con un _____.', fact: 'Lápiz es llana y termina en z, por eso lleva tilde.' },
    { word: 'fácil', hint: 'Sumar 2 + 2 es muy _____.', fact: 'Fácil es llana y termina en l, por eso lleva tilde.' },
    { word: 'difícil', hint: 'El problema era _____ y tardé en resolverlo.', fact: 'Difícil es llana y termina en l, por eso lleva tilde.' },
    { word: 'médico', hint: 'El _____ revisó al paciente.', fact: 'Médico es esdrújula y lleva tilde.' },
    { word: 'águila', hint: 'El _____ vuela muy alto y ve a gran distancia.', fact: 'Águila es esdrújula y lleva tilde.' },
    { word: 'oxígeno', hint: 'Respiramos _____ del aire.', fact: 'Oxígeno es esdrújula y lleva tilde.' },
    { word: 'átomo', hint: 'Todo lo que existe está formado por átomos; un _____ es muy pequeño.', fact: 'Átomo es esdrújula y lleva tilde.' },
    { word: 'exámenes', hint: 'Mañana empiezan los _____ del bimestre.', fact: 'Examen no lleva tilde, pero su plural exámenes es esdrújula y sí la lleva.' },
    { word: 'pingüino', hint: 'El _____ vive en lugares muy fríos.', fact: 'La diéresis (ü) se escribe para que suene la u en güe y güi.' },
    { word: 'bilingüe', hint: 'Una persona _____ habla dos idiomas.', fact: 'Lleva diéresis (ü) para que se pronuncie la u en güe.' },
    { word: 'jirafa', hint: 'La _____ tiene el cuello muy largo.', fact: 'Jirafa se escribe con j.' },
    { word: 'hormiga', hint: 'La _____ carga hojas más grandes que ella.', fact: 'Hormiga empieza con h, que no se pronuncia.' },
    { word: 'vaca', hint: 'La _____ nos da leche.', fact: 'Vaca se escribe con v.' },
    { word: 'cerebro', hint: 'El _____ controla todo el cuerpo.', fact: 'Cerebro se escribe con c: ce-re-bro.' },
    { word: 'zapato', hint: 'Se amarró el _____ antes de correr.', fact: 'Zapato se escribe con z.' },
    { word: 'ciudadano', hint: 'Todo _____ tiene derechos y deberes.', fact: 'Ciudad y ciudadano se escriben con c.' },
    { word: 'bosque', hint: 'En el _____ viven muchos animales.', fact: 'Bosque se escribe con b.' },
    { word: 'huevo', hint: 'Desayuné un _____ con frijoles.', fact: 'Huevo empieza con h y lleva v.' },
    { word: 'invierno', hint: 'En _____ las mañanas son más frías.', fact: 'Invierno se escribe con v.' },
    { word: 'guitarra', hint: 'Mi tío toca la _____ en las fiestas.', fact: 'Guitarra lleva u después de la g, y esa u no se pronuncia.' },
  ],

  debug: [
    { fact: 'Casi todo el agua del planeta está en los océanos, y es salada.', steps: [
      { label: 'El agua hierve a 100 °C al nivel del mar.', isBug: false, explanation: '' },
      { label: 'El agua se congela a 0 °C.', isBug: false, explanation: '' },
      { label: 'El agua está formada por hidrógeno y oxígeno.', isBug: false, explanation: '' },
      { label: 'La mayor parte del agua de la Tierra es agua dulce.', isBug: true, explanation: 'La mayor parte del agua del planeta es salada, la de los océanos. El agua dulce es una parte pequeña.' },
      { label: 'Las nubes se forman cuando el vapor de agua se enfría.', isBug: false, explanation: '' },
    ] },
    { fact: 'El Sol es una estrella, y es lo que da luz y calor a los planetas.', steps: [
      { label: 'La Tierra gira alrededor del Sol.', isBug: false, explanation: '' },
      { label: 'La Luna es un satélite natural de la Tierra.', isBug: false, explanation: '' },
      { label: 'El Sol es un planeta.', isBug: true, explanation: 'El Sol no es un planeta: es una estrella.' },
      { label: 'Júpiter es el planeta más grande del Sistema Solar.', isBug: false, explanation: '' },
      { label: 'La Tierra tarda cerca de 365 días en dar una vuelta al Sol.', isBug: false, explanation: '' },
    ] },
    { fact: 'Respirar y bombear sangre son tareas de órganos distintos que trabajan juntos.', steps: [
      { label: 'Los pulmones llevan el oxígeno del aire a la sangre.', isBug: false, explanation: '' },
      { label: 'El corazón bombea la sangre por el cuerpo.', isBug: false, explanation: '' },
      { label: 'El cerebro está protegido por el cráneo.', isBug: false, explanation: '' },
      { label: 'El hígado es el órgano que se encarga de respirar.', isBug: true, explanation: 'Respirar es trabajo de los pulmones. El hígado cumple otras funciones, como ayudar a procesar los nutrientes.' },
      { label: 'Los huesos sostienen el cuerpo.', isBug: false, explanation: '' },
    ] },
    { fact: 'Las plantas necesitan agua, luz y nutrientes del suelo para crecer.', steps: [
      { label: 'Las plantas fabrican su alimento con la luz del sol.', isBug: false, explanation: '' },
      { label: 'La fotosíntesis libera oxígeno.', isBug: false, explanation: '' },
      { label: 'Las raíces absorben agua y minerales del suelo.', isBug: false, explanation: '' },
      { label: 'Las plantas pueden vivir mucho tiempo sin nada de agua.', isBug: true, explanation: 'Todas las plantas necesitan agua para vivir; algunas la guardan, pero no pueden vivir sin ella.' },
      { label: 'Las hojas verdes tienen clorofila.', isBug: false, explanation: '' },
    ] },
    { fact: 'Para calcular la mitad de un número, se divide entre 2.', steps: [
      { label: 'La mitad de 40 es 20.', isBug: false, explanation: '' },
      { label: 'El doble de 15 es 30.', isBug: false, explanation: '' },
      { label: 'El 25 por ciento de 100 es 25.', isBug: false, explanation: '' },
      { label: 'La mitad de 50 es 20.', isBug: true, explanation: 'La mitad de 50 es 25, porque 50 dividido entre 2 es 25.' },
      { label: '10 × 10 = 100.', isBug: false, explanation: '' },
    ] },
    { fact: 'El quetzal es el nombre de la moneda y también el de un ave: el ave nacional.', steps: [
      { label: 'La moneda de Guatemala es el quetzal.', isBug: false, explanation: '' },
      { label: 'Guatemala está en Centroamérica.', isBug: false, explanation: '' },
      { label: 'El idioma oficial de Guatemala es el inglés.', isBug: true, explanation: 'El idioma oficial de Guatemala es el español; además se hablan 22 idiomas mayas, entre otros.' },
      { label: 'El lago de Atitlán está en el departamento de Sololá.', isBug: false, explanation: '' },
      { label: 'Tikal se encuentra en el departamento de Petén.', isBug: false, explanation: '' },
    ] },
    { fact: 'Los manglares protegen las costas y son criaderos de peces.', steps: [
      { label: 'Reciclar ayuda a reducir la basura.', isBug: false, explanation: '' },
      { label: 'Los árboles absorben dióxido de carbono.', isBug: false, explanation: '' },
      { label: 'Los manglares protegen las costas.', isBug: false, explanation: '' },
      { label: 'Quemar la basura no contamina el aire.', isBug: true, explanation: 'Quemar basura suelta humo y gases que contaminan el aire y dañan la salud.' },
      { label: 'Ahorrar agua ayuda a cuidar el ambiente.', isBug: false, explanation: '' },
    ] },
    { fact: 'El agua es la mejor bebida para hidratarse.', steps: [
      { label: 'Lavarse las manos ayuda a prevenir enfermedades.', isBug: false, explanation: '' },
      { label: 'Dormir bien ayuda a aprender mejor.', isBug: false, explanation: '' },
      { label: 'Las frutas y las verduras aportan vitaminas.', isBug: false, explanation: '' },
      { label: 'Tomar mucha soda es la mejor manera de hidratarse.', isBug: true, explanation: 'La mejor forma de hidratarse es tomar agua. Las sodas tienen mucha azúcar.' },
      { label: 'Hacer ejercicio fortalece el corazón.', isBug: false, explanation: '' },
    ] },
    { fact: 'Cuando el agua cambia de estado, sigue siendo la misma sustancia.', steps: [
      { label: 'El hielo es agua en estado sólido.', isBug: false, explanation: '' },
      { label: 'El vapor es agua en estado gaseoso.', isBug: false, explanation: '' },
      { label: 'Los líquidos toman la forma del recipiente que los contiene.', isBug: false, explanation: '' },
      { label: 'Los sólidos no tienen forma propia.', isBug: true, explanation: 'Los sólidos sí tienen forma propia; son los líquidos y los gases los que toman la forma del recipiente.' },
      { label: 'Al calentar agua líquida hasta que hierve, se convierte en vapor.', isBug: false, explanation: '' },
    ] },
    { fact: 'Los reptiles necesitan del calor del ambiente para calentar su cuerpo.', steps: [
      { label: 'Los mamíferos alimentan a sus crías con leche.', isBug: false, explanation: '' },
      { label: 'Las aves tienen plumas.', isBug: false, explanation: '' },
      { label: 'Los peces respiran por branquias.', isBug: false, explanation: '' },
      { label: 'Los reptiles son animales de sangre caliente.', isBug: true, explanation: 'Los reptiles son de sangre fría: su temperatura depende del ambiente.' },
      { label: 'Las ranas son anfibios.', isBug: false, explanation: '' },
    ] },
    { fact: 'Las energías renovables, como la solar o la del viento, no se agotan.', steps: [
      { label: 'La energía solar viene del Sol.', isBug: false, explanation: '' },
      { label: 'El viento puede producir energía eléctrica.', isBug: false, explanation: '' },
      { label: 'El agua en movimiento puede generar electricidad.', isBug: false, explanation: '' },
      { label: 'El petróleo es una fuente de energía renovable.', isBug: true, explanation: 'El petróleo no es renovable: se formó durante millones de años y se agota.' },
      { label: 'Los paneles solares convierten la luz en electricidad.', isBug: false, explanation: '' },
    ] },
    { fact: 'Las palabras agudas llevan tilde solo cuando terminan en n, s o vocal.', steps: [
      { label: 'El sustantivo nombra personas, animales o cosas.', isBug: false, explanation: '' },
      { label: 'El verbo expresa acciones.', isBug: false, explanation: '' },
      { label: 'Una oración puede terminar con punto, con signo de interrogación o con signo de exclamación.', isBug: false, explanation: '' },
      { label: 'Todas las palabras agudas llevan tilde.', isBug: true, explanation: 'Las agudas solo llevan tilde si terminan en n, s o vocal; por ejemplo, "canción" sí y "reloj" no.' },
      { label: 'Un sinónimo es una palabra de significado parecido.', isBug: false, explanation: '' },
    ] },
    { fact: 'Un huracán necesita mar cálido para formarse y perder fuerza al llegar a tierra.', steps: [
      { label: 'La lluvia forma parte del ciclo del agua.', isBug: false, explanation: '' },
      { label: 'En Guatemala hay una época seca y una época lluviosa.', isBug: false, explanation: '' },
      { label: 'El clima es el comportamiento del tiempo durante muchos años.', isBug: false, explanation: '' },
      { label: 'Los huracanes se forman sobre los desiertos.', isBug: true, explanation: 'Los huracanes se forman sobre mares cálidos, no sobre desiertos.' },
      { label: 'La evaporación convierte el agua líquida en vapor.', isBug: false, explanation: '' },
    ] },
    { fact: 'El cero fue una gran idea de la civilización maya, usado en su sistema de numeración.', steps: [
      { label: 'Los mayas construyeron ciudades como Tikal.', isBug: false, explanation: '' },
      { label: 'Los mayas usaron un sistema de numeración de base 20.', isBug: false, explanation: '' },
      { label: 'Los mayas desarrollaron un calendario muy preciso.', isBug: false, explanation: '' },
      { label: 'Los mayas no conocían el número cero.', isBug: true, explanation: 'Los mayas sí conocían el cero y lo usaban en su sistema de numeración.' },
      { label: 'El maíz es un alimento fundamental en la cultura maya.', isBug: false, explanation: '' },
    ] },
  ],

  reading: [
    {
      title: 'El agua que bebemos',
      passage: 'El agua que sale del chorro de una casa hizo un largo viaje. Primero cayó como lluvia sobre montañas y bosques. Una parte corrió por los ríos y otra se filtró en la tierra, donde se juntó en depósitos subterráneos llamados acuíferos.\n\nDespués, el agua se bombea hasta una planta de tratamiento. Allí se limpia con filtros y se desinfecta para que sea segura. Finalmente viaja por tuberías hasta las casas.\n\nPor eso cuidar los bosques es cuidar el agua: sus árboles sostienen el suelo y ayudan a que la lluvia se filtre en lugar de perderse. Y cuando cerramos el chorro mientras nos cepillamos los dientes, ayudamos a que alcance para todos.',
      questions: [
        { question: '¿De qué trata principalmente el texto?', options: ['Del recorrido del agua hasta llegar a las casas y de cómo cuidarla', 'De cómo construir una planta de tratamiento', 'De los peces que viven en los ríos', 'De por qué llueve más en las montañas'], correctIndex: 0 },
        { question: 'Según el texto, ¿qué se hace en la planta de tratamiento?', options: ['Se calienta el agua para evaporarla', 'Se limpia con filtros y se desinfecta', 'Se mezcla con agua de mar', 'Se guarda en acuíferos'], correctIndex: 1 },
        { question: '¿Por qué el texto dice que cuidar los bosques es cuidar el agua?', options: ['Porque los árboles producen agua', 'Porque en los bosques no llueve', 'Porque los árboles sostienen el suelo y ayudan a que la lluvia se filtre', 'Porque los bosques están cerca de las plantas de tratamiento'], correctIndex: 2 },
        { question: 'En el texto, la palabra "filtró" significa que el agua…', options: ['se evaporó', 'se congeló', 'se contaminó', 'pasó lentamente a través de la tierra'], correctIndex: 3 },
      ],
      fact: 'Los acuíferos pueden guardar agua durante muchísimos años.',
    },
    {
      title: 'La ceiba del parque',
      passage: 'En el centro del pueblo había una ceiba tan grande que cuatro niños no alcanzaban a abrazarla. Cada tarde, doña Carmen vendía atol de elote bajo su sombra, y los niños jugaban a su alrededor.\n\nUn día, Mateo notó que las hojas estaban amarillas y que la tierra cerca de las raíces estaba cubierta de cemento. —Creo que la ceiba tiene sed —dijo—. El agua de lluvia ya no llega a sus raíces.\n\nEntre todos, con permiso del alcalde, quitaron un pedazo de cemento y sembraron pasto alrededor. Al llegar la lluvia, el agua por fin entró en la tierra. Pocas semanas después, la ceiba volvió a llenarse de hojas verdes. Doña Carmen sonrió: —Hay que escuchar a los más pequeños, porque ven lo que los demás no miran.',
      questions: [
        { question: '¿Qué problema notó Mateo?', options: ['Que la ceiba era muy pequeña', 'Que la ceiba tenía las hojas amarillas y el cemento cubría su tierra', 'Que doña Carmen había dejado de vender atol', 'Que los niños ya no jugaban en el parque'], correctIndex: 1 },
        { question: '¿Qué hicieron las personas para ayudar a la ceiba?', options: ['La regaron todos los días con cubetas', 'La cambiaron de lugar', 'Quitaron un pedazo de cemento y sembraron pasto', 'Cortaron sus ramas secas'], correctIndex: 2 },
        { question: '¿Qué se puede deducir de que las hojas volvieron a ponerse verdes?', options: ['Que la ceiba estaba falsa', 'Que el problema era que el agua no llegaba a las raíces', 'Que el atol de doña Carmen era mágico', 'Que el alcalde plantó otra ceiba'], correctIndex: 1 },
        { question: 'Cuando doña Carmen dice "los más pequeños ven lo que los demás no miran", quiere decir que…', options: ['los niños tienen mejor vista que los adultos', 'los niños a veces se fijan en detalles importantes que otros pasan por alto', 'solo los niños pueden cuidar los árboles', 'los adultos nunca se equivocan'], correctIndex: 1 },
      ],
      fact: 'Algunos árboles grandes, como la ceiba, pueden vivir cientos de años.',
    },
    {
      title: 'Cómo sembrar una huerta escolar',
      passage: 'Una huerta en el patio de la escuela es una excelente forma de aprender. Para empezar, siga estos pasos.\n\nPrimero, elija un lugar donde el sol llegue por lo menos seis horas al día. Segundo, afloje la tierra con un azadón y retire las piedras y las raíces viejas. Tercero, mezcle la tierra con abono hecho de hojas secas y restos de comida de verduras.\n\nCuarto, siembre las semillas. Las más fáciles para comenzar son el rábano, el cilantro y la lechuga. Por último, riegue temprano en la mañana o al caer la tarde, y pida a cada grupo que se encargue de su surco.\n\nSi la huerta se cuida todos los días, en un mes podrán cosechar los primeros rábanos.',
      questions: [
        { question: '¿Para qué sirve este texto?', options: ['Para contar un cuento sobre una huerta', 'Para dar la opinión del autor sobre la escuela', 'Para explicar paso a paso cómo hacer una huerta', 'Para anunciar una feria de ciencias'], correctIndex: 2 },
        { question: 'Según el texto, ¿qué se hace justo antes de sembrar las semillas?', options: ['Se riega la tierra', 'Se cosechan los rábanos', 'Se retiran las semillas viejas', 'Se mezcla la tierra con abono'], correctIndex: 3 },
        { question: '¿Cuál es el mejor lugar para la huerta, según el texto?', options: ['Uno donde el sol llegue por lo menos seis horas al día', 'Uno que siempre esté en sombra', 'Uno cerca de la cocina', 'Uno donde nunca llueva'], correctIndex: 0 },
        { question: 'Del texto se puede deducir que los rábanos…', options: ['tardan un año en crecer', 'solo crecen en invierno', 'crecen relativamente rápido', 'no necesitan agua'], correctIndex: 2 },
      ],
      fact: 'El abono hecho con restos de comida se llama composta.',
    },
    {
      title: 'Leer cada día vale la pena',
      passage: 'Algunas personas piensan que leer es una pérdida de tiempo, pero yo creo lo contrario: leer unos minutos cada día es una de las mejores inversiones que podemos hacer.\n\nEn primer lugar, la lectura amplía el vocabulario. Quien lee mucho conoce más palabras y puede expresar mejor lo que piensa. En segundo lugar, leer entrena la concentración: para seguir una historia hay que prestar atención durante un buen rato, algo cada vez más difícil con tantas pantallas.\n\nFinalmente, un libro nos permite conocer lugares y vidas que, de otra forma, nunca conoceríamos. Para empezar, basta con quince minutos antes de dormir. Lo importante no es leer rápido, sino leer todos los días.',
      questions: [
        { question: '¿Cuál es la idea que defiende el autor?', options: ['Que leer rápido es lo más importante', 'Que leer unos minutos cada día es muy valioso', 'Que las pantallas son mejores que los libros', 'Que solo se debe leer antes de dormir'], correctIndex: 1 },
        { question: 'Según el texto, ¿qué ocurre con el vocabulario de quien lee mucho?', options: ['Se vuelve más grande', 'Se olvida', 'No cambia', 'Se vuelve más difícil de usar'], correctIndex: 0 },
        { question: 'En el texto, "entrena la concentración" quiere decir que leer…', options: ['cansa los ojos', 'ayuda a mejorar la capacidad de prestar atención', 'sirve para hacer ejercicio', 'quita el sueño'], correctIndex: 1 },
        { question: '¿Para qué crees que el autor da el ejemplo de los "quince minutos antes de dormir"?', options: ['Para mostrar que leer exige mucho tiempo', 'Para decir que solo se puede leer de noche', 'Para criticar a quienes duermen poco', 'Para mostrar que es fácil empezar con poco tiempo'], correctIndex: 3 },
      ],
      fact: 'Leer en voz alta a los niños pequeños ayuda a que aprendan a hablar y a leer mejor.',
    },
    {
      title: 'La escuela estrena biblioteca',
      passage: 'Ayer, estudiantes y docentes del centro educativo inauguraron su nueva biblioteca, que tiene más de 400 libros. La mayoría fue donada por las familias durante una campaña que duró dos meses.\n\nLa biblioteca abrirá de lunes a viernes durante el recreo y una hora después de la salida. Cada estudiante podrá llevar un libro a casa por una semana, y para ello recibirá un carné.\n\n—Queríamos que todos tengan la oportunidad de leer, aunque en casa no haya muchos libros —explicó la directora. Los alumnos de sexto grado se encargarán de ordenar los estantes y ayudar a los más pequeños a elegir su lectura.',
      questions: [
        { question: '¿Qué ocurrió en el centro educativo?', options: ['Se inauguró una nueva biblioteca', 'Se terminó una campaña de reciclaje', 'Se cerró la biblioteca vieja', 'Se celebró el día del libro'], correctIndex: 0 },
        { question: '¿Cómo se consiguió la mayoría de los libros?', options: ['Los compró el gobierno', 'Los imprimió el centro educativo', 'Los prestó otra escuela', 'Los donaron las familias'], correctIndex: 3 },
        { question: '¿Qué necesita un estudiante para llevar un libro a casa?', options: ['Un carné', 'Un permiso del alcalde', 'Ser alumno de sexto grado', 'Pagar una cuota'], correctIndex: 0 },
        { question: '¿Por qué crees que la directora dijo que "todos tengan la oportunidad de leer"?', options: ['Porque a todos les gusta leer lo mismo', 'Porque en algunas casas no hay muchos libros y la biblioteca ayuda a que todos puedan leer', 'Porque los libros son muy caros', 'Porque los alumnos no tienen tiempo'], correctIndex: 1 },
      ],
      fact: 'En muchas comunidades, una biblioteca escolar es el primer lugar donde los niños tienen libros a su alcance.',
    },
    {
      title: 'El quetzal',
      passage: 'El quetzal es un ave de unos 35 centímetros de largo, con plumas verdes brillantes y el pecho rojo. Los machos, durante la época de reproducción, lucen una cola que puede medir más de medio metro.\n\nVive en los bosques nubosos de Guatemala y de otros países de Centroamérica, donde el aire es húmedo y fresco. Se alimenta sobre todo de frutos, en especial de aguacatillos, y al comerlos ayuda a esparcir las semillas por el bosque. Anida en huecos de árboles viejos.\n\nHoy está en peligro porque los bosques donde vive se talan para sembrar o construir. Por eso, cuidar los bosques nubosos es la mejor manera de proteger al quetzal.',
      questions: [
        { question: '¿Dónde vive el quetzal?', options: ['En los manglares de la costa', 'En los desiertos', 'En los bosques nubosos, húmedos y frescos', 'En las ciudades'], correctIndex: 2 },
        { question: 'Según el texto, ¿cómo ayuda el quetzal al bosque?', options: ['Cuidando los nidos de otras aves', 'Esparciendo las semillas de los frutos que come', 'Limpiando los árboles de insectos', 'Haciendo huecos en los árboles viejos'], correctIndex: 1 },
        { question: '¿Cuál es la principal amenaza para el quetzal?', options: ['La falta de frutos', 'Los animales que lo cazan', 'Que los bosques donde vive se talan', 'El frío de la noche'], correctIndex: 2 },
        { question: 'En el texto, la expresión "lucen una cola" significa que los machos…', options: ['pierden la cola', 'esconden la cola', 'tienen la cola corta', 'muestran una cola vistosa'], correctIndex: 3 },
      ],
      fact: 'El quetzal es el ave nacional de Guatemala y también da nombre a su moneda.',
    },
    {
      title: 'El zompopo y la lluvia',
      passage: 'Era la época seca y el pequeño zompopo Tito llevaba su hojita verde por el camino, detrás de la larga fila de sus compañeros. De pronto, vio que sus hermanas descansaban a la sombra, riendo.\n\n—¿Por qué no descansas? —le preguntaron—. Todavía hay mucho tiempo antes de las lluvias.\n\nPero Tito recordaba lo que le había enseñado la abuela: "Lo que se guarda hoy se come mañana". Así que siguió trabajando, hoja tras hoja, hasta llenar su rincón de la despensa del hormiguero.\n\nCuando por fin llegó la lluvia y el camino se volvió un lodazal, nadie pudo salir a buscar comida. Las hermanas de Tito miraron sus despensas casi vacías. Entonces Tito, sonriendo, abrió la suya y les dijo: —Hay para todos. Comamos juntos.',
      questions: [
        { question: '¿Qué hizo Tito mientras sus hermanas descansaban?', options: ['Se fue a jugar', 'Se escondió de la lluvia', 'Siguió cargando hojas para la despensa', 'Les pidió comida'], correctIndex: 2 },
        { question: '¿Qué pasó cuando llegó la lluvia?', options: ['Nadie pudo salir a buscar comida', 'El hormiguero se inundó por completo', 'Tito perdió todas sus hojas', 'Las hermanas encontraron más hojas'], correctIndex: 0 },
        { question: 'La frase de la abuela, "Lo que se guarda hoy se come mañana", significa que…', options: ['conviene prepararse hoy para las necesidades del futuro', 'hay que comer todo lo que se pueda hoy', 'la comida se pudre si se guarda', 'solo los zompopos deben guardar comida'], correctIndex: 0 },
        { question: '¿Qué enseñanza deja el cuento?', options: ['Que trabajar siempre es mejor que descansar', 'Que la previsión y compartir ayudan a toda la comunidad', 'Que la lluvia siempre es peligrosa', 'Que los hermanos nunca deben jugar'], correctIndex: 1 },
      ],
      fact: 'Los zompopos cortan hojas para cultivar con ellas un hongo del que se alimentan.',
    },
    {
      title: 'Aviso para las familias',
      passage: 'El Centro Educativo invita a madres, padres y encargados a la Feria de Ciencias, que se realizará el viernes 14 de este mes, de 8:00 a 11:00 de la mañana, en el patio central.\n\nLos estudiantes presentarán sus proyectos sobre agua, energía y cuidado del ambiente. La entrada es gratuita. Se les pide llegar puntualmente y, si es posible, traer una bolsa de tela para llevar los materiales que se regalarán.\n\nEn caso de lluvia, la feria se trasladará a los salones y el horario será el mismo. Para más información, comunicarse con la dirección del centro en horario de clases.',
      questions: [
        { question: '¿Cuál es el propósito de este aviso?', options: ['Pedir dinero a las familias', 'Invitar a las familias a la Feria de Ciencias', 'Suspender las clases el viernes', 'Contar cómo se hizo un proyecto'], correctIndex: 1 },
        { question: '¿A qué hora termina la feria?', options: ['A las 8:00', 'A las 9:00', 'A las 10:00', 'A las 11:00'], correctIndex: 3 },
        { question: '¿Qué pasará si llueve ese día?', options: ['La feria se cancelará', 'La feria se pasará a los salones, con el mismo horario', 'La feria será otro día', 'La feria será solo para los estudiantes'], correctIndex: 1 },
        { question: 'Según el aviso, ¿por qué se pide traer una bolsa de tela?', options: ['Porque la entrada se paga con ellas', 'Porque se venderán bolsas en la feria', 'Para llevar los materiales que se regalarán', 'Para guardar los zapatos'], correctIndex: 2 },
      ],
      fact: 'Un aviso claro responde qué, cuándo, dónde y para quién.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Problemas de matemática sin conexión (mismo criterio que la función SQL
// generate_math_problems: nivel según el grado, historias con contexto
// guatemalteco desde 4to grado, sin repetir cuentas dentro de un juego y sin
// "1 huevos").
// ---------------------------------------------------------------------------
window.practiceMathProblems = function practiceMathProblems(grade, count = 10) {
  const level = String(grade || '').toLowerCase();
  let rank = 5;
  if (level.includes('primaria')) rank = /^(1ro|2do|3ro)/.test(level) ? 2 : 5;
  else if (level.includes('básico') || level.includes('basico')) rank = 8;
  else if (level.includes('diversificado')) rank = 11;

  const int = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const T = {
    '+': ['Un bus llevaba {a} pasajeros y en la siguiente parada subieron {b} más. ¿Cuántos pasajeros lleva ahora?',
      'En la tienda escolar vendieron {a} panes en la mañana y {b} en la tarde. ¿Cuántos panes vendieron en total?',
      'Una cooperativa empacó {a} quintales de café el lunes y {b} el martes. ¿Cuántos quintales empacó en total?',
      'Un agricultor cosechó {a} costales de maíz el lunes y {b} costales más el martes. ¿Cuántos costales tiene en total?'],
    '-': ['Había {a} huevos en la granja y se vendieron {b}. ¿Cuántos huevos quedan?',
      'Un camión salía con {a} cajas de tomate y entregó {b} en el mercado. ¿Cuántas cajas le quedan?',
      'Una tienda tenía {a} libras de azúcar y vendió {b}. ¿Cuántas libras le quedan?',
      'En un vivero hay {a} árboles y ya se trasplantaron {b}. ¿Cuántos árboles faltan por trasplantar?'],
    '×': ['Un vivero siembra {a} hileras con {b} plantas cada una. ¿Cuántas plantas hay en total?',
      'Cada canasta tiene {a} naranjas. Si hay {b} canastas, ¿cuántas naranjas hay en total?',
      'Un salón tiene {a} filas de {b} pupitres cada una. ¿Cuántos pupitres hay en total?',
      'Una avícola guarda {a} huevos en cada cartón. ¿Cuántos huevos hay en {b} cartones?'],
    '÷': ['Se repartieron {a} libras de frijol en partes iguales entre {b} familias. ¿Cuántas libras le tocan a cada una?',
      'Un docente reparte {a} lápices en partes iguales entre {b} estudiantes. ¿Cuántos lápices le tocan a cada uno?',
      'Una cooperativa envasó {a} litros de miel en botellas iguales y llenó {b} botellas. ¿Cuántos litros tiene cada botella?',
      'Se juntaron {a} quetzales para el paseo escolar entre {b} estudiantes en partes iguales. ¿Cuánto puso cada uno?'],
  };
  const fill = (tpl, a, b) => tpl.replace('{a}', a).replace('{b}', b);

  const make = () => {
    let a, b, op, answer;
    if (rank <= 3) {
      a = int(1, 20); b = int(1, 20);
      if (Math.random() < 0.5) { op = '+'; answer = a + b; } else { if (a < b) [a, b] = [b, a]; op = '-'; answer = a - b; }
    } else if (rank <= 6) {
      const k = int(0, 2);
      a = int(1, 100); b = int(1, 100);
      if (k === 0) { op = '+'; }
      else if (k === 1) { op = '-'; if (a < b) [a, b] = [b, a]; }
      else { a = int(1, 10); b = int(1, 10); op = '×'; }
      a = Math.max(a, 2); b = Math.max(b, 2);
      if (op === '-' && a < b) [a, b] = [b, a];
      answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
    } else if (rank <= 9) {
      const k = int(0, 2);
      if (k === 0) { a = int(2, 21); b = int(2, 21); op = '×'; answer = a * b; }
      else if (k === 1) { b = int(2, 11); answer = int(1, 15); a = b * answer; op = '÷'; }
      else { a = int(2, 11); b = int(2, 4); op = '^'; answer = Math.pow(a, b); }
    } else if (Math.random() < 0.5) {
      a = int(1, 15); answer = int(1, 15); b = a + answer; op = 'x+';
    } else {
      a = pick([10, 20, 25, 50, 75]); b = pick([40, 80, 100, 200, 50]); answer = Math.round(a * b / 100); op = '%';
    }
    let question;
    if (rank > 3 && T[op]) question = fill(pick(T[op]), a, b);
    else if (op === 'x+') question = `x + ${a} = ${b}  (¿cuánto vale x?)`;
    else if (op === '%') question = `¿Cuánto es el ${a}% de ${b}?`;
    else question = `${a} ${op} ${b}`;
    return { question, answer };
  };

  const seen = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    let p = make();
    for (let tries = 0; seen.has(p.question) && tries < 25; tries++) p = make();
    seen.add(p.question);
    out.push(p);
  }
  return out;
};

// Elige un ejercicio del banco prefiriendo los que no salieron hace poco.
// "keyOf" saca la clave comparable de cada ejercicio; "seen" son las últimas
// claves que ya salieron en este dispositivo.
window.practiceBankPick = function practiceBankPick(game, seen = [], keyOf = null) {
  const bank = (window.PRACTICE_BANK || {})[game] || [];
  if (!bank.length) return null;
  const key = keyOf || ((it) => it.word || it.title || (it.steps || []).find(s => s.isBug)?.label || '');
  const seenSet = new Set(seen.map(s => String(s).toLowerCase()));
  const fresh = bank.filter(it => !seenSet.has(String(key(it)).toLowerCase()));
  const pool = fresh.length ? fresh : bank;
  return pool[Math.floor(Math.random() * pool.length)];
};
