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
- **Link de invitación** (opcional): cada invitado se anota solo con su nombre y una pista de lo que le gusta. El organizador ve los inscriptos con 🔄 Actualizar. La inscripción se cierra sola al sortear y se puede reabrir.
- El sorteo y los resultados quedan solo en el `localStorage` del navegador del organizador. Nunca se suben a la base.

## Inscripciones (Supabase)

Las inscripciones se guardan en un proyecto de Supabase (`amigo-invisible`). Las tablas no se pueden leer ni escribir directo. Todo pasa por funciones:

| Función | Quién | Qué hace |
|---|---|---|
| `create_event` | organizador | crea el evento y devuelve `code` + `admin_token` |
| `admin_get` / `admin_update_event` / `admin_remove` | organizador (con token) | ver inscriptos con pistas, editar evento/abrir-cerrar, sacar a alguien |
| `get_invite` | cualquiera con el código | datos del evento + nombres anotados (sin pistas) |
| `join_event` | cualquiera con el código | anotarse (si está abierto, sin nombres repetidos, máx. 100) |
| `update_wish` | el propio invitado (con su token) | cambiar su pista |

El token de organizador queda solo en el navegador donde se creó la invitación.

## Publicarla (GitHub Pages)

Settings → Pages → *Deploy from a branch* → elegir la rama y carpeta `/ (root)`.
Los links solo les funcionan a los demás si la página está publicada (no abriéndola como archivo local).

## Ojo con la privacidad

El resultado va **dentro del link** (después del `#`, así que nunca llega a ningún servidor), ofuscado para evitar spoilers accidentales. **No es cifrado**: alguien con ganas de hacer trampa podría decodificarlo. Para un sorteo entre amigos/familia sobra.
