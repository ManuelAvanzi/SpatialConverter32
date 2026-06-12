# Context — admin-redazione
> Frontend della piattaforma editoriale: lista laboratori, login, gestione progetti.
> Updated: 2026-06-08
> Loaded via: /ctx 3 admin-redazione

---

## Files involved
| File | Role |
|------|------|
| `viewer/admin.html` | SPA redazione monofile (~330 righe): login gate, grid progetti, modal CRUD, filtri tag/search |

Backend consumato: tutte le rotte `/api/*` di `server/index.js` → vedi `[[server]]`.

---

## How it works
> Max 10 lines. Only what's not obvious.
- **Monofile**: HTML + CSS + `<script>` inline, niente framework, niente build. Helper `api(p,o)=fetch` con `Content-Type: application/json`.
- **Gate auth**: `refresh()` chiama `/api/me`; se non autenticato mostra `#login`, altrimenti `#app`. `doLogin()` → `/api/login`, su 401 "Password errata".
- **Lista**: `load()` → `GET /api/projects` → `PROJECTS`; `render()` filtra per `activeTag` + search e costruisce le card.
- **Card actions** (per progetto): Editor (`/?project=slug&edit`), Play (`/?project=slug`, target blank), Duplica (`/duplicate`), Scarica (`/download`), Modifica (modal), Pubblica/Privato (PUT status), Elimina (modal conferma).
- **Modal**: stesso per Nuovo e Modifica (`editingSlug` null/valorizzato). Cover via `/cover` (multipart) poi PUT `cover` url.
- **XSS-safe**: nomi/tag iniettati con `textContent` non in innerHTML (es. `.name`, `.tag[i]`). Cover URL escaped sugli apici.

---

## Decisions made
- 2026-06: SPA monofile senza framework, coerente col viewer (no build step su tutto il frontend).
- 2026-06: stesso modal per crea/modifica; "Crea e apri editor" porta direttamente in `?project=...&edit`.
- 2026-06: elimina progetto NON cancella gli asset su R2 ("i modelli su R2 restano") — solo il record JSON.
- 2026-06: nomi/tag renderizzati con `textContent` per evitare XSS da input redazione.

---

## Errors already made in this area
- Iniettare `p.name`/tag in `innerHTML` → ✅ usare `textContent` dopo aver costruito la card.

---

## TODO / Tech debt
- [ ] Nessuna paginazione/lazy: `render()` ricostruisce tutta la grid a ogni search keystroke.
- [ ] Errori API spesso silenziosi (solo alert su duplica); poco feedback su PUT/DELETE falliti.
- [ ] Delete cancella il record ma lascia asset orfani su R2 (by design, ma cresce nel tempo).

---

## Investigations done
- 2026-06-08: mappato admin.html via ripgrep + Read righe 213-274 (render card + modal). Flusso auth/CRUD qui sopra; non serve ri-leggere.
