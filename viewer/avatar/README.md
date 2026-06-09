# Avatar terza persona

`Xbot.glb` — manichino umanoide neutro (Mixamo "X Bot"), preso dagli esempi
ufficiali di three.js (`examples/models/gltf/Xbot.glb`).

- Clip incluse: `idle`, `walk`, `run` (+ pose extra non usate).
- La posa di salto non esiste nel file: è generata proceduralmente nel viewer
  (gambe raccolte via ossa `mixamorig:*`, vedi `updateThirdPerson` in index.html).
- I colori tenui (corpo sabbia, giunti grigio-azzurro) sono applicati a runtime
  (niente texture), vedi `loadAvatar()`.
- Caricato lazy: solo quando l'utente attiva la terza persona (🎥 / tasto V).
