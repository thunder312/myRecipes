# ToDo #
- [x] Einkaufszettel aus dem Rezept
editierbar, erweiterbar und exportierbar als Text und PDF.
- [x] Portionen-Scaler auf der Rezept-Detail-Seite

## Nächste Features:
- [x] Koch-Modus: ablenkungsfreier Schritt-für-Schritt-Modus, Bildschirm bleibt an (WakeLock API)
- [x] Rezept duplizieren: Kopieren-Button als Vorlage für Varianten
- [x] Favoritenmarkierung: Stern/Herz pro Rezept + Filter in der Übersicht
- [x] Rezepte bewerten: Smiley-Rating (1–5, ganzzahlig), Wert wird per Klick gesetzt.
  6 Zustände: „–" unbewertet = neutraler Smiley, 1 = weinend, 2 = traurig, 3 = lachend,
  4 = lachend mit sichtbaren Zähnen, 5 = Herzaugen. Jeder Smiley hält eine Tafel mit
  der entsprechenden Zahl. DB-Spalte `rating REAL` ist bereits vorhanden.

   ^------------------------------ andere Emoticons benutzt ------------------------^
- [x] Wochen-Kochplan unter "Was koche ich?"
  - [x] alphabetisch sortieren
  - [x] filter in Export berücksichtigen
  - [x] <- zum Wochenplan soll zu Wochenplan gehen nicht zu "was koch ich"-Tab
  - [x] ausgestrichene machen Kategorie grau
- [x] Mache eine Weiche, ob ich gerade auf dem Test-system oder Produktiv bin. Das Testsystem-Tab und auch die GUI soll einen optischen Marker erhalten, damit es keine Verwchslungen gibt, wenn ich beide Versionen offen habe.
- [x] Baue Notizen in der Rezept-Detailsicht um. Es soll nur noch ein Notizfeld geben. Neue Notizen von Usern, werden unten angefügt mit Username und Datum. Quasi ähnlich wie ein Chat. Korrigiere mehrfach Notizen auch auf dem Prod-System. Wenn mehrere existieren, fasse sie zusammen. Wenn du den Urheber der Notiz nicht ermitteln kannst, schreibe "imported" und das Import-Datum des Rezeptes.
- [x] Auch den Einkaufszettel für ein einzelnes Rezept soll man nicht nur exportieren können, sondern auch gleich in die Einkaufs-Sicht wechseln können.
- [x] Die Einkaufsliste soll direkt in die App Bring exportiert werden können
- [x] Bring! Account-Verwaltung pro Benutzer (Einstellungen), direkter Push über API
- [x] Der Freitextfilter in der Übersicht soll auch auf dieses Herkunftsfeld filtern
- [x] Der Import soll optional auch nach einem passenden Bild im Internet suchen (Rezeptname), und dies gleich mit importieren. Falls die neue Option im Import ausgewählt wurde.
- [x] Es soll in den Optionen eine Möglichkeit geben, für sein eigenes Kochbuch für alle Rezepte ein Bild im Internet zu suchen (bestehende werden überschrieben.
- [x] Selbsterfasste und bestehende Rezepte sollen nach der Eingabe auch die Möglichkeit haben, von der KI in den Punkten Beilagen, Tags, Beschreibung und Bild ergänzt werden können.
- [x] Der Button Kochmodus soll oben unter der Überschrift plaziert werden
- [x] Es soll ein News-Pop-Up geben, das die neuen Rezepte und Features auflistet, die seit dem letzten Login hinzugekommen sind.
      Es soll mit OK bestätigt werden können oder in den Einstellungen komplett pro User abschaltbar sein.
- [x] Auto-Backup der DB nach Dropbox alle 24h 2 Saves reichen (ältere löschen).
- [x] Bilder im Rezeptbuch-Export optional inkludieren.
- [x] Rezept-Detailseite reSTehtr das jetzt auch in den Releasenotes?factoren
    - Bild in Mini-Ansicht per Klick vergrößern.
    - Portionen-Edit nur im Bearbeitungs-Modus
    - Rezept-PDF-Block einklappbar
    - Notizen: Texte: "Halte fest, was dir beim Kochen aufgefallen ist." und "Noch keine Notizen vorhanden." entfernen, da selbsterklärend.
    - Koch-Statistik, deutlich kleiner formatieren, weil nicht so wichtig.
- [x] Die neuen Rezepte in den Releasenotes sollen Links direkt auf das Rezept sein und die Liste auch bei vielen Rezepten nicht abgekürzt werden.
- [x] gespeicherte Fragen in der "Was koche ich"- Kategorie sollen gelöscht werden können.
- [x] URLs in den Feldern Von wem/woher und Notizen sollen erkannt werden und als klickbare Links gerendert werden in der Rezept-Detail-Sicht
- [x] In den Rezept-Details soll es oben eine kleine Anzeige geben wer das Rezept importiert hat und in welchen Rezeptbüchern das Rezept ist.
- [x] Weitere Rezepte mit diesen Einstellungen; Im Import soll neben dem Haken "mehrere Rezepte in dieser Quelle" ein Haken sein, der die Import-Sicht nach dem bestätigten Import offen hält und Das optional gewählte Kochbuch beibehält auch das Feld "Quelle (optional)" mit dem letzten Wert befüllt stehen lässt.
- [x] In der Import-Vorschau soll auch das gewählte/importiere Rezept-Bild angezeigt werden.
## Bugs
### Desktop
### Mobil
- [x] Buttons in mobiler Sicht korrigieren.
- [x] Herz in mobiler Sicht korrigieren
- [x] Teste alle bestehenden Features auch für Apple bzw. Safari. Sollte es Probleme geben, baue diese gegebenenfalls um.
## KI
- [x] Nach KI sind gleiche Zutaten wieder getrennt.
- [x] KI auf Chefkoch trainieren, um Bilder zu finden.
  - [x] Pixabay Massen-Import ist kacke. -> Google Bilder suche oder Chefkoch?
  - [x] unpassende Bilder (KI gefunden) aus der DB entfernen

## Handschrift trainieren

## Claude
- [x] Autopilot

## Final
