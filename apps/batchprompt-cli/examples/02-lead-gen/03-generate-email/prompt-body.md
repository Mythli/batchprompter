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

Basierend auf dem Datensatz musst du das folgende E-Mail Template nehmen und die Daten in den eckigen Klammern [...] entsprechend an die wirklich bekannten Daten anpassen. Je nachdem wieviele Informationen zur verfügung stehen, nimmst du entweder 'Weiterleitung Rang bekannt' oder 'Weiterleitung Rang unbekannt'.

Der Text in den eckigen Klammern [...] musst du anhand des vorhandenen Datensatzes entsprechend anpassen.

Es ist deine absolute Pflicht das folgende Template zu benutzen und nicht zu verändern, abgesehen und mit der einzigen Ausnahme der eckigen Klammern [...].

START E-Mail Template:

Weiterleitung Rang bekannt:	Bitte an [hier der Rang, z.B. 'den 1. Vorsitzenden/die 1. Vorsitzende'] [hier der Name bestehend aus Vorname und Nachname] weiterleiten, falls [ihn/sie] diese E-Mail nicht persönlich erreicht hat.
Weiterleitung Rang unbekannt: Bitte an [hier der Name] weiterleiten, falls [ihn/sie] diese E-Mail nicht persönlich erreicht hat.

Hallo [an das Team der Kreisjägerschaft Kurköln Olpe e. V. /sidenote: add/write/change 'an das Team der Kreisjägerschaft Kurköln Olpe e. V.' to whatever the actual data is and do not end this with a comma - there is no comma after the greeting and the email starts after the greeting sentence with a capital letter 'I' in the word Ich]
/ oder
[Waidmannsheil /sidenote: Waidmannsheil steht hier als Platzhalter für eine Begrüßungs-{Floskel}. Sollte es in der industry '{{industry}}' eine bestimmte {Floskel} (ein catchword) zur Begrüßung geben, beginnst du die E-Mail mit dem jeweiligen catchword - der jeweiligen Branchenbezogenen, internen, {Floskel}. Für Jagdschulen wäre so eine {Floskel} z.B. 'Waidmannsheil' aber du musst selber abschätzen welche Folskel in der industry '{{industry}}' benutzt wird. Solle es keine {Floskel} geben, beginnst du die Email ganz einfach mit 'Hallo [Vorname]' /sidenote: there is no comma after the greeting and the email starts after the greeting sentence with a capital letter 'I' in the word Ich]

Ich bin gestern Nacht bei meiner Recherche über [die Jungjägerausbildung /sidenote: add/write/change 'Jungjägerausbildung' to whatever they offer here] auf eure Seite [der Kreisjägerschaft Hamm] gestoßen.

Vorab muss ich wirklich Respekt zollen für das was [du/ihr] [da mit der Jagdschein-Akademie /sidenote: add/write/change to whatever the actual data is] aufgebaut [habt/hast]. [Besonders wie du die Brücke zwischen der klassischen Ausbildung und deinem digitalen Pro Mitgliederbereich schlägst ist genial. Dass du da nicht nur Lerninhalte hast, sondern das direkt mit dem LIVE Jagdschein-Coaching in Staffel 1 und 2 koppelst, ist schon eine echte Hausnummer. Man merkt einfach sofort, dass du das nicht nur als Job machst sondern da richtig Herzblut drinsteckt. /sidenote: this phrase must be much shorter, use a maximum of 220 Characters only!, again, only a maximum of 220 Characters here and add/write here something related to what they actual do based on the actual data]

Ich kann mir gut vorstellen dass du deine Zeit [lieber auf dem Stand, im Revier oder in der Werkstatt verbringst /sidenote: add/write here something related to what the person actual does based on the actual data, e.g. based on the persons rank or/and his/her responsibilities and what they offer], anstatt dich abends noch mit Papierkram, Teilnehmerlisten oder Rechnungen herumzuschlagen oder?

Genau das Thema hat mich als Entwickler nie losgelassen. Ich hab 2015 als Pilotprojekt eine Software für eine Segelschule in Hamburg gebaut um denen die Verwaltungsarbeit zu erleichtern und aus dieser Lösung ist am Ende eine Firma mit über 200 Kunden entstanden. Ich habe mich zuletzt wirklich voll reingehängt um unsere Butlerapp so umzubauen, dass sie auch perfekt für Schwimmschulen passt. Die Software soll am Ende halt wirklich verstehen wie der Laden bei euch eigentlich läuft.

Die Laura von der Schwimmschule Bavaria und der Yannik vom Berliner Schwimmverein Friesen 1895 e.V. arbeiten bereits damit. Stell dir vor die ganze Anmeldung [von den Jungjägern /sidenote: add/write/change 'Jungjägern' to whatever they offer while keeping in mind that whatever they offer needs to be booked online so that the phrase 'die ganze Anmeldung' that stand before whatever you are going to set here makes sense and is not out of context: .Stell dir vor die ganze Anmeldung ...] und der Kram mit den E-Rechnungen läuft da einfach komplett im Hintergrund von alleine und die beiden haben den Kopf endlich frei für die Ausbildung.

[set here the Vorname '{{websiteAgent.decisionMaker.firstName}}'], ich hab das zwar schon mit Laura und Yannik getestet aber ich würde wahnsinnig gerne deine Meinung als [Fachmann /or Expertin /sidenote: here set either 'Fachmann' if the person is a male or 'Expertin' if the person is a female (you have to detect and estimate - based on the persons first name which is '{{websiteAgent.decisionMaker.firstName}}' in this case - if the gender is either male or female and set the word accordingly)] dazu hören. Schau dir die Seite für die Schwimmschulen doch bitte mal kurz an und sag mir was du davon hältst und was ich vielleicht noch dazu programmieren sollte damit es dir richtig den Rücken freihält.

Ich hab hier mal den aktuellen Stand für dich hochgeladen: www.butlerapp.de/Schwimmschulen?{{id}}

Für dein ehrliches Feedback (muss nicht lang sein) wäre ich dir echt dankbar und es würde mich wirklich freuen von dir zu hören [Vorname].

Ich sende liebe Grüße aus Berlin,
Tobias

--

**Tobias Anhalt**

Tel:   +49 30 22957151
Mail:  tobias@butlerapp.de
Web:   www.butlerapp.de

Webbee GmbH
Mühlenstraße 8a
14167 Berlin
Geschäftsführer: Tobias Anhalt
Amtsgericht Charlottenburg | HRB 192759

ENDE E-Mail Template.

Du gibst nur die fertige E-Mail aus. Schreibe NIEMALS einen Betreff (weder das Wort "Betreff:" noch den eigentlichen Betreff-Text). Gib ausschließlich den reinen E-Mail-Text (Body) zurück. Der allererste Satz deiner Ausgabe MUSS entweder der Weiterleitungstext oder die Begrüßung ("Hallo...") sein.

Rules to follow:
1. Rule:
Keep the hyperlink www.butlerapp.de/Schwimmschulen?{{id}} untouched, the link stays as it is!

2. Rule:
End the Email as shown in the Template:

Für dein ehrliches Feedback (muss nicht lang sein) wäre ich dir echt dankbar und es würde mich wirklich freuen von dir zu hören [Vorname].

Ich sende liebe Grüße aus Berlin,
Tobias

--

**Tobias Anhalt**

Tel:   +49 30 22957151
Mail:  tobias@butlerapp.de
Web:   www.butlerapp.de

Webbee GmbH
Mühlenstraße 8a
14167 Berlin
Geschäftsführer: Tobias Anhalt
Amtsgericht Charlottenburg | HRB 192759

3. Rule:
The 'Weiterleitung' text is only part of the email in case you might notice that '{{websiteAgent.decisionMaker.email}}' is not the personal email from '{{websiteAgent.decisionMaker.firstName}} {{websiteAgent.decisionMaker.lastName}}', you ask to forward/pass-through/transfer the email to '{{websiteAgent.decisionMaker.firstName}} {{websiteAgent.decisionMaker.lastName}}' at the very top of the email before the actual email text starts. In order to know if '{{websiteAgent.decisionMaker.email}}' is (or is not) the direct, personal email of '{{websiteAgent.decisionMaker.firstName}} {{websiteAgent.decisionMaker.lastName}}' you need to check if parts of the persons fist and last name ('{{websiteAgent.decisionMaker.firstName}} {{websiteAgent.decisionMaker.lastName}}') are part/occur/appear/exist inside '{{websiteAgent.decisionMaker.email}}'. E.g. is the persons name is: "Martin Becker" and the email would be m.becker@gmail.com it would mean it must be his personal email. Another example: if the persons name is "Sarah Schuster" and the email is sarah.schuster@gmx.de it must also be the personal mail, because parts of the persons fist and last name occur/appear/exist inside the email. Another exmaple: if the email starts schema-guided/with a pattern like: support@, info@, fragen@, help@, contact@, kontakt@, webmaster@, mail@, (... and so on and so forth), it means it can not be the persons email and therefor you ask to forward/pass-through/transfer the email to '{{websiteAgent.decisionMaker.firstName}} {{websiteAgent.decisionMaker.lastName}}' at the very top of the email because the email belongs to this person! If it is clear that it is the persons personal mail, the Mail will have no 'Weiterleitung' part at all!

4. Rule:
Once again, if it is clear that it is the persons personal email address, the Mail will have no 'Weiterleitung' part at all!

5. Rule:
The characters [ and ] are never part of the final email, in that template they jsut serve as placeholders for you to understand where to fill in the data, but the final email will not have any square brackets at all. Once again: NO square brackets in the final email!

6. Rule:
You use the exact template wording as followed:

[Weiterleitungstext] (only if a 'Weiterleitung' is needed)
[free, empty line]
... here follows the email

You do not output:

Weiterleitung Rang bekannt:
or
Weiterleitung Rang unbekannt:
or
Weiterleitung:
in all cases, in the final output you ONLY write the text itself (e.g. "Bitte an ... weiterleiten..."), but only in case a Weiterleitung-Text is needed. If not, you leave it out completely. DO NOT add the prefix "Weiterleitung:".

So the final output, in any case, will be ONLY the email body:

[Weiterleitungstext] (only if needed, without any prefix)
[free, empty line]
... here follows the email
