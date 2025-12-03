You are a UX developer at Butlerapp, a modern booking software.

Create realistic booking and dashboard data in German for a mobile booking form for the {{industry}} industry.

First object consists of:
1. **Primary Color:** A hex code (e.g., #E63946) that perfectly matches the industry (e.g., green for nature, blue for business).

Second object (booking form) consists of:

1. **Company Name:** A short, symbolic company name (maximum 12 characters).

2. **Headline:** The offer title (short and concise) and subheadline (price/duration). Details include location and time.

3. **Step:** The first step is usually called "Select Date," "Select Ticket," or something similar, depending on the industry.

4. **Input Data:** Only 3 input fields, typical for the first step of booking (e.g., date, number of people, rate/option). (max length of every field 26 letters)

5. **Footer:** Standard navigation.

**Important Rules:**

- Language: German.

- Currency: Euro (€).

- Date: A realistic date for the end of 2025.

- Prices: Realistic market prices for {{industry}}.

- Location: A typical major German city (e.g., Berlin, Hamburg, Munich) or a suitable region.

- Style: Professional, concise, and clear.

**Example for "First Aid Course":**
Company: "RescuePoint"
Color: "#D32F2F"
Title: "CPR Course"
Subtitle: "(9 lessons) €59.00"
Details: ["Venue: German Red Cross Center in Berlin", "Time: 9:00–16:30"]
Step 1: "Select Course Date"
Enter 1: "Course Date*" -> "November 15, 2025"
Enter 2: "Number of Participants*" -> "1 person"
Enter 3: "Selected Price*" -> "Driver's License Package €59.00"

Third object rules:
1. **details field should be cope and pasted from example**: Example ("details": {"language": "de-DE","currency": "EUR"},)
2. **sidebar_navigation should be cope and pasted from example**: Example ("sidebar_navigation": {"position": "left","theme": "teal","items": [{"icon": "logo","type": "brand"},{"icon": "search","label": "Search"},{"icon": "home","label": "Home"},{"icon": "user","label": "Profile"},{"icon": "booking","label": "Booking"},{"icon": "messages","label": "Messages"},{"icon": "accounts","label": "Accounts"},{"icon": "payment","label": "Payment"},{"icon": "bank","label": "Bank"},{"icon": "users","label": "Guests"},{"icon": "envelope","label": "Messages"},{"icon": "file-invoice","label": "Invoices"},{"icon": "wallet","label": "Finance"},{"icon": "university","label": "Bank"},{"icon": "tag","label": "Offers"},{"icon": "cog","label": "Settings","position": "bottom"},{"icon": "question-circle","label": "Help","position": "bottom"},{"icon": "avatar","label": "User Account","position": "bottom"}]},)
3. **Generate 3 kpi_cards**: Select what you'll be changing in the label and specify a high value for this value in the value field. If you're specifying in the label that you're measuring the number of people in the course, this value should be high (from 100 to 500 people, for example). If you're measuring income from the course, the amount should also be high.
4. **analytics_section**: cope and paste this ("analytics_section": {"title": "RESERVIERUNGSSTATISTIK","filters": [{"label": "Zeitraum","type": "dropdown"},{"label": "Reservierungsstatistik","type": "dropdown"},{"label": "Veröffent. Buchungen","type": "dropdown"}],"chart": {"type": "area_line_chart","x_axis": "Days (0-30)","y_axis": "Volume (0-300)","total_overlay": {"value": "967,56","currency": "€","label": "TOTAL"},"trend_line": "positive"}},) but change analytics_section.chart.total_overlay.value to different. (from 900 to 1100)
5. **data_table**: ("title": "Buchungsliste","columns": [{"key": "select","label": "Checkbox"},{"key": "id","label": "№"},{"key": "name","label": "Name"},{"key": "phone","label": "Telefon"},{"key": "amount","label": "Betrag"},{"key": "status","label": "Status"}],) this should be the same. you need generate 7 rows but amount need be from 800 to 1200 status and status_color can be ("status": "Überfällig", "status_color": "brown") or ("status": "Bezahlt","status_color": "green"), nothing else

Generate data for: {{industry}}.