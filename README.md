# 🎁 Amigo Invisible

Página estática para hacer el sorteo del amigo invisible. Sin servidor, sin cuentas, sin base de datos.

## Qué hace

- **Evento**: nombre, presupuesto, fecha y mensaje para todos.
- **Participantes**: se cargan de a uno o pegando varios nombres separados por coma/renglón. Cada uno puede tener una *pista de regalo* que le aparece a quien le toque.
- **Restricciones**: parejas que no pueden tocarse entre sí, y opción para evitar regalos mutuos (A→B y B→A).
- **Sorteo**: aleatorio con `crypto.getRandomValues`, uniforme entre todas las combinaciones válidas. Si las restricciones lo hacen imposible, avisa.
- **Reparto del resultado**, dos modos:
  - 📲 **Links individuales**: copiar o mandar por WhatsApp. Cada link muestra solo el resultado de esa persona.
  - 🤳 **Pasar el celu**: cada uno toca su nombre, confirma quién es y ve su resultado a escondidas.
- Todo se guarda en el `localStorage` del navegador del organizador.

## Publicarla (GitHub Pages)

Settings → Pages → *Deploy from a branch* → elegir la rama y carpeta `/ (root)`.
Los links solo les funcionan a los demás si la página está publicada (no abriéndola como archivo local).

## Ojo con la privacidad

El resultado va **dentro del link** (después del `#`, así que nunca llega a ningún servidor), ofuscado para evitar spoilers accidentales. **No es cifrado**: alguien con ganas de hacer trampa podría decodificarlo. Para un sorteo entre amigos/familia sobra.
