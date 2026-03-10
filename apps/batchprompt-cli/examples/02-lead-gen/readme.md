# AI Lead Generation & Outreach Pipeline

This repository contains an automated, multi-stage pipeline to find, enrich, and contact leads using AI. Because this process relies on LLM APIs and web scraping, it is designed with strict testing phases to ensure high data quality and to prevent unnecessary API costs.

## 📋 Prerequisites
Ensure your `.env` file is configured with the necessary API keys (e.g., OpenAI/Gemini) and your Gmail credentials (`GMAIL_EMAIL` and `GMAIL_PASSWORD`) for the final sending step.

---

## 🚀 The Process

### 1. Pre-flight: Verify Customer Database
Before starting a new campaign, ensure that all current customer websites are up-to-date in your customer support database.  
*Note: The `1-find.sh` script automatically runs `filter-customers.cjs` at the end of its execution to cross-reference and exclude known customer URLs from your newly generated leads.*

### 2. Find Leads (Test Run)
Always test your search queries before executing a full run. We do this by limiting the input (number of cities) and the output (number of leads per city).

Run the following command to test with **3 cities** and limit the search to **3 leads per city** (yielding ~9 leads total):

```bash
./examples/02-lead-gen/01-find-leads/1-find.sh "Schwimmschulen" --input-limit 3 --2-output-limit 3
```

### 3. Quality Assurance (Crucial)
Open the generated `out/02-lead-gen/companies.csv` file.

* Check for false positives: Are these actually the types of businesses you are looking for?
* Check the URLs: Are they direct company websites, or did aggregator sites (Yelp, directories) slip through?
* If the results are poor, adjust the search prompts in `config-1-find.json` and repeat Step 2.

### 4. Find Leads (Full Run)
Once you are 100% satisfied with the test results, execute the full run across all cities.

> ⚠️ **WARNING:** A full run can take 3 to 10 hours and costs approximately $50 per 1,000 leads.

```bash
./examples/02-lead-gen/01-find-leads/1-find.sh "Schwimmschulen"
```

### 5. Data Cleaning (Filter Garbage)
Before spending money on the expensive enrichment step, manually filter out garbage entries from `out/02-lead-gen/companies.csv`.

* Look for: Unwanted franchises, non-profits (e.g., DRK, DLRG), or irrelevant domains.
* Pro-Tip: This is most easily done using DuckDB + AI to quickly query, identify, and delete unwanted rows based on company names or URL patterns.

### 6. Enrich Leads
This step visits the websites to extract contact details, decision-maker info, and top offers.

**A. Test Run (10 Leads):** Verify the extraction schema is working correctly before doing the full batch.

```bash
./examples/02-lead-gen/02-enrich/2-enrich.sh --input-limit 10
```

Check `out/02-lead-gen/companies_enriched.csv`. If the data looks accurate, proceed to the full run.

**B. Full Run:**

> ⚠️ **WARNING:** The full enrichment run takes about 8 hours and costs approximately $100 per 1,000 leads.

```bash
./examples/02-lead-gen/02-enrich/2-enrich.sh
```

### 7. Generate Emails & Verify
Generate the personalized email subjects and bodies based on the enriched data.

Test with 10 leads first:

```bash
./examples/02-lead-gen/03-generate-email/4-email.sh --input-limit 10
```

Open `out/02-lead-gen/companies_emails.csv` and carefully read the generated emails.

* Are the placeholders filled correctly?
* Is the forwarding text ("Bitte an ... weiterleiten") formatted properly?
* Are the line breaks in the signature correct?

If everything is perfect, run the command without the `--input-limit` flag to generate the rest.

### 8. Send Emails
Once you have manually verified the generated emails in the CSV, run the send command. This will dispatch the emails via the configured Gmail account.

```bash
./examples/02-lead-gen/05-send/5-send.sh
```

You can monitor the delivery status and thread IDs in the resulting `out/02-lead-gen/5-send-results.csv` file.
