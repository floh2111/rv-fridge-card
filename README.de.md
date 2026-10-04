# RV Fridge Card

Eine Lovelace-Karte für eine Kompressor-Kühlbox (Wohnwagen, Wohnmobil, Boot),
die über ESPHome in Home Assistant steht (z. B. eine Tuya-BLE-Kühlbox an einem
ESP32). Sie bildet die Kühlbox-Seite des Fridolin-Touch-Displays nach: Ring mit
Zieltemperatur, Ist-Temperatur, Ein/Aus, Modus (MAX/ECO) und Batterieschutz
(L/M/H) - nur untereinander statt in Spalten.

![Vorschau](images/preview.jpg)

## Installation (HACS)

1. HACS -> drei Punkte -> *Benutzerdefinierte Repositories* -> dieses
   Repository mit der Kategorie **Dashboard** hinzufügen.
2. **RV Fridge Card** installieren und den Browser neu laden.

## Konfiguration

Karte im Dashboard-Editor hinzufügen (alle Entities lassen sich dort
auswählen) oder per YAML:

```yaml
type: custom:rv-fridge-card
title: Kühlbox
entity_power: switch.fridolin_display_kuhlbox_power
entity_target: select.fridolin_display_kuhlbox_zieltemperatur
entity_mode: select.fridolin_display_kuhlbox_modus
entity_battery_protection: select.fridolin_display_kuhlbox_batterieschutz
entity_temp: sensor.fridolin_display_kuhlbox_temperatur
entity_battery: sensor.fridolin_display_kuhlbox_batterie   # optional
entity_voltage: sensor.fridolin_display_kuhlbox_spannung   # optional
```

| Option | Entity-Typ | Erwartete Werte |
| --- | --- | --- |
| `entity_power` | `switch` | `on` / `off` |
| `entity_target` | `select` | Optionen `-20 °C` ... `20 °C` (ganze Grad) |
| `entity_mode` | `select` | Optionen `MAX` / `ECO` |
| `entity_battery_protection` | `select` | Optionen `L` / `M` / `H` |
| `entity_temp` | `sensor` | Ist-Temperatur in °C |
| `entity_battery`, `entity_voltage` | `sensor` | optional, steht in der Fußzeile |

Die Entity-IDs oben sind nur ein Beispiel - nimm die, die deine Kühlbox
tatsächlich anlegt.

## Verhalten

- `-` / `+` ändern den angezeigten Zielwert sofort; mehrere schnelle Klicks
  gehen nach einer kurzen Pause als **ein** Befehl raus (die Kühlbox antwortet
  per Bluetooth langsam).
- *Verbunden* heißt: Der Temperatursensor ist verfügbar und wurde in den
  letzten fünf Minuten aktualisiert.
- Statustext: *Aus*, *Bereit*, *Kühlt* (Ist über Ziel) oder *Keine Daten*.

## Farben

Die Karte nutzt ihre eigene dunkelblaue Palette (wie das Display). Anpassbar
per `card-mod` oder Theme-Variablen: `--rv-fridge-bg`, `--rv-fridge-panel`,
`--rv-fridge-button`, `--rv-fridge-active`, `--rv-fridge-text`,
`--rv-fridge-muted`.

## Lizenz

MIT
