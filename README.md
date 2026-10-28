# Kamado-Grillsimulator

Simuliert einen Kamado-Keramikgrill im Browser: Kohle anzünden, Zu- und Abluft
einstellen, Ventilator von Hand oder per PID-Regler fahren, Grillgut auflegen und
der Kerntemperatur beim Steigen zusehen – auf Wunsch im Zeitraffer.

## Starten

```sh
uv run grillsim
```

Dann <http://127.0.0.1:5007> öffnen. Mehrere Browserfenster sehen denselben Grill.

## Was simuliert wird

- **Wärmemodell:** Keramik mit großer Wärmekapazität, Verluste über die Hülle
  (inkl. Abstrahlung bei hohen Temperaturen) und über den Abgasstrom.
- **Feuer:** Die Glut breitet sich nach dem Anzünden erst aus, reagiert verzögert
  auf mehr oder weniger Luft, erstickt bei geschlossenen Lüftungen und verbraucht
  Kohle (ca. 50–100 g/h bei Low & Slow, über 1 kg/h bei Vollgas).
- **Luftstrom:** Zuluft × Abluft × Kaminzug (wächst mit der Temperatur) plus Ventilator.
- **Deckel:** Offen entweicht die Hitze schnell, die Glut bekommt aber mehr Luft.
- **Ventilatorregler:** PID mit Anti-Windup, hält die Zieltemperatur.
- **Grillgut:** Kerntemperatur folgt dem Garraum träge; Rippchen und Pulled Pork
  haben einen Stall um 65–75 °C.

Grobe Richtwerte ohne Ventilator: 15 % Lüftung ≈ 110 °C, 20 % ≈ 145 °C,
50 % ≈ 320 °C, ganz offen ≈ 480 °C.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `grillsim/physics.py` | Grillmodell und Grillgut |
| `grillsim/controller.py` | PID-Regler für den Ventilator |
| `grillsim/simulation.py` | Zeitraffer, Verlauf, Befehle |
| `grillsim/app.py` | FastAPI-Server, WebSocket `/ws`, REST `/api/state` und `/api/command` |
| `grillsim/static/` | Oberfläche (ohne Build-Schritt, keine JS-Abhängigkeiten) |
| `grillsim/static/kamado.js` | Animierter Kamado-Querschnitt: Glut, Lüftungen, Ventilator, Deckel, Rauch, Grillgut |

Befehle sind JSON-Objekte wie `{"action": "lower_vent", "value": 0.3}`, entweder
über den WebSocket oder per `POST /api/command`.

## Tests

```sh
uv run pytest
```
