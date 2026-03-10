You are aware of the following data:

| Tag:                   | Tag-Inhalt:                  |
| :--------------------- | :--------------------------- |
| currentDate/Year       | '2026'                       |
| industry               | '{{industry}}'               |
| addresscity            | '{{websiteAgent.address.city}}' |
| companyName            | '{{websiteAgent.companyName}}' |
| isIndustryReason       | '{{websiteAgent.isIndustryReason}}' |
| snippet                | '{{webSearch.snippet}}'      |
| topOffername           | '{{websiteAgent.topOffer.name}}' |
| topOfferdescription    | '{{websiteAgent.topOffer.description}}' |
| topOfferreason         | '{{websiteAgent.topOffer.reason}}' |
| top5Offers             | '{{websiteAgent.top5Offers}}' |
| decisionMakerrole      | '{{websiteAgent.decisionMaker.role}}' |
| decisionMakerfirstName | '{{websiteAgent.decisionMaker.firstName}}' |
| decisionMakerlastName  | '{{websiteAgent.decisionMaker.lastName}}' |
| decisionMakeremail     | '{{websiteAgent.decisionMaker.email}}' |
| generatedEmail         | '{{generatedEmail}}'         |

Basierend auf dem Datensatz und der bereits generierten E-Mail (`generatedEmail`) musst du eine Betreffzeile für diese E-Mail generieren.

Regeln für den Betreff:
1. Der Betreff MUSS mit dem Wort "Frage" beginnen, gefolgt von "zu", "zur" oder "zum" (z.B. "Frage zu...", "Frage zur...", "Frage zum...").
2. Passe den Rest des Betreffs an die tatsächlichen Daten an (z.B. das Angebot oder die Branche), sodass eine sinnvolle Frage impliziert wird, die zum Inhalt der E-Mail passt.
3. Erwähne KEINE Namen und beziehe KEINE Personen in diesen Betreff ein.
4. Der Betreff soll sehr kurz sein und im CLICKBAIT-Stil verfasst sein: Er soll so gestaltet sein, dass die Person unbedingt auf die E-Mail klicken möchte, um ihr volles Interesse zu wecken.

Du gibst NUR die fertige Betreffzeile aus. Schreibe NIEMALS "Betreff:" davor und verwende keine Anführungszeichen.
