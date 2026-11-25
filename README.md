# Aufklapp-Bereich

Eine Überschrift mit Doppelpfeil ganz rechts: Darunter stehen Karten, die immer sichtbar sind, und
Karten, die erst nach einem Tipp auf den Pfeil erscheinen – ein zweiter Tipp klappt sie wieder zu. In
der Überschrift links neben dem Pfeil zeigt eine Vorschau die Symbole ausgewählter Geräte, solange sie
eingeschaltet sind (z. B. welche Lampen gerade brennen).

So bleibt eine Startseite übersichtlich: das Wichtigste sofort, die Details auf Abruf.

*English: A heading with a double-chevron toggle: some cards always visible, more cards revealed on tap,
plus a preview of switched-on devices in the heading. Fully editable in the visual editor. German user
interface.*

## Installation

1. **Einstellungen → Marketplace → Über Link hinzufügen** und
   `https://github.com/bryce2071/aufklapp-bereich` eintragen (Typ *Dashboard*), dann **Aufklapp-Bereich**
   herunterladen. Die Ressource trägt der Marketplace selbst ein.
2. Browser bzw. App einmal neu laden. Danach steht „Aufklapp-Bereich“ in der Kartenauswahl.

## Bedienung im Editor

- Überschrift, Symbol, Größe der Überschrift (groß oder klein).
- **Vorschau in der Überschrift:** Geräte auswählen – ihr Symbol erscheint neben dem Pfeil, solange sie an
  sind. Das Symbol wird aus den Karten übernommen, falls dort eins eingestellt ist.
- **Beim Öffnen aufgeklappt**, **Zustand auf diesem Gerät merken** (sonst nach jedem Neuladen wieder im
  Ausgangszustand) oder ein **Helfer** (Ein/Aus-Schalter, `input_boolean`) – dann ist der Bereich auf
  allen Geräten gleich auf- oder zugeklappt.
- **Immer sichtbare Karten** und **Aufklappbare Karten:** hinzufügen, bearbeiten, verschieben und löschen
  wie in einem Stapel – mit dem normalen Karten-Editor von Home Assistant.

Im Bearbeiten-Modus des Dashboards sind die aufklappbaren Karten immer zu sehen (blass, solange der
Bereich zugeklappt ist), damit man sie bearbeiten kann.

## Beispiel

```yaml
type: custom:aufklapp-bereich
titel: Beleuchtung
icon: mdi:lightbulb-group
vorschau:
  - light.esstisch
  - light.wohnzimmer
merken: true
karten:
  - type: tile
    entity: light.esstisch
  - type: tile
    entity: light.wohnzimmer
details:
  - type: entities
    entities:
      - light.flur
      - light.terrasse
```

## YAML-Felder

| Feld | Bedeutung |
|---|---|
| `titel` | Überschrift |
| `icon` | optional, Symbol vor der Überschrift |
| `stil` | optional, `title` = groß (Standard), `subtitle` = klein |
| `vorschau` | optional, Liste von Entitäten – ihr Symbol erscheint in der Überschrift, solange sie an sind |
| `aufgeklappt` | optional, `true` = beim Öffnen schon aufgeklappt |
| `merken` | optional, `true` = letzten Zustand auf diesem Gerät merken |
| `helfer` | optional, `input_boolean` – Zustand über den Helfer, auf allen Geräten gleich |
| `karten` | immer sichtbare Karten |
| `details` | aufklappbare Karten |

**Breite der Karten:** wie in einer Abschnitts-Ansicht auf einem Raster mit 12 Spalten. Jede Karte bringt
ihre übliche Breite mit (Kachel = halbe Breite, die meisten anderen = ganze Breite); `grid_options` im
Code-Editor einer Karte ändert das, z. B. `grid_options: {columns: 3, rows: 2}`. Mehrere Karten
nebeneinander geht auch mit einer Raster-Karte.

## Hinweise

- Die Überschrift ist die eingebaute Überschriften-Karte von Home Assistant, der Pfeil ein Knopf darin.
- Wer die Datei vorher von Hand eingebunden hatte (`/local/aufklapp-bereich.js`), entfernt diese
  Ressource (**Einstellungen → Dashboards → ⋮ → Ressourcen**), sonst lädt der Browser die ältere Fassung.

## Lizenz

MIT
