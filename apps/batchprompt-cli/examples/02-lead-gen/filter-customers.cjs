const fs = require('fs');

const BATCH_SIZE = 200;

(async () => {
    const inputFile = process.argv[2];
    const outputFile = process.argv[3];

    if (!inputFile || !outputFile) {
        console.error("Usage: node filter-customers.js <input_csv> <output_csv>");
        process.exit(1);
    }

    if (!fs.existsSync(inputFile)) {
        console.error(`Input file not found: ${inputFile}`);
        process.exit(1);
    }

    const csvContent = fs.readFileSync(inputFile, 'utf8');

    // Dynamic import for papaparse
    const { default: Papa } = await import('papaparse');

    const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true
    });

    const rows = parsed.data;
    if (rows.length === 0) {
        console.log("No rows in CSV.");
        return;
    }

    // Identify URL column.
    const urlCol = 'webSearch.link';

    const urls = rows.map(row => row[urlCol]).filter(u => u && typeof u === 'string' && u.trim().length > 0);
    const uniqueUrls = [...new Set(urls)];

    if (uniqueUrls.length === 0) {
        console.log("No URLs found to check.");
        fs.writeFileSync(outputFile, csvContent);
        return;
    }

    console.log(`Checking ${uniqueUrls.length} unique URLs against database...`);

    const batches = [];
    for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
        batches.push(uniqueUrls.slice(i, i + BATCH_SIZE));
    }

    const matchedDomains = new Set();
    let processedCount = 0;
    let batchIndex = 1;
    const totalBatches = batches.length;
    const startTime = Date.now();

    for (const batch of batches) {
        console.log(`\n[Batch ${batchIndex}/${totalBatches}] Starting processing of ${batch.length} URLs...`);
        const batchStartTime = Date.now();
        let batchMatchedCount = 0;

        try {
            const url = `https://crisp-lamps-rest.app.taylordb.ai/api/trpc/domains.matchUrls`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ urls: batch })
            });

            if (!response.ok) {
                console.error(`API Error: ${response.status} ${response.statusText}`);
                const text = await response.text();
                console.error(text);
                continue;
            }

            const json = await response.json();

            if (json.error) {
                console.error(`tRPC Error: ${json.error.message || JSON.stringify(json.error)}`);
                continue;
            }

            // Handle tRPC response structure robustly based on the spec
            let results = [];
            if (json.result && json.result.data && Array.isArray(json.result.data.results)) {
                results = json.result.data.results;
            } else if (Array.isArray(json.results)) {
                results = json.results;
            } else if (Array.isArray(json) && json[0]?.result?.data?.results) {
                // Handle potential tRPC array-batched response
                results = json[0].result.data.results;
            } else {
                console.error(`[Batch ${batchIndex}/${totalBatches}] Unexpected response format:`, JSON.stringify(json).substring(0, 200));
                continue;
            }

            for (const res of results) {
                if (res.matched) {
                    matchedDomains.add(res.url);
                    batchMatchedCount++;
                }
            }

        } catch (e) {
            console.error(`[Batch ${batchIndex}/${totalBatches}] Error checking batch:`, e);
        }

        processedCount += batch.length;
        const batchEndTime = Date.now();
        const batchDuration = (batchEndTime - batchStartTime) / 1000;

        const totalElapsedTime = batchEndTime - startTime;
        const avgTimePerUrl = totalElapsedTime / processedCount;
        const remainingUrls = uniqueUrls.length - processedCount;
        const estimatedRemainingTimeSec = (remainingUrls * avgTimePerUrl / 1000).toFixed(1);

        console.log(`[Batch ${batchIndex}/${totalBatches}] Finished in ${batchDuration.toFixed(1)}s. Processed ${processedCount}/${uniqueUrls.length} URLs. Filtered out this batch: ${batchMatchedCount} (Total: ${matchedDomains.size}). Estimated time remaining: ${estimatedRemainingTimeSec}s`);
        batchIndex++;
    }

    const filteredRows = [];
    const keptRows = [];
    let idCounter = 1;

    console.log('\nFiltering rows based on results...');
    for (const row of rows) {
        const url = row[urlCol];
        if (url && matchedDomains.has(url)) {
            filteredRows.push(row);
            const name = row['websiteAgent.companyName'] || row['companyName'] || 'Unknown';
            console.log(`[FILTERED] Existing customer: ${url} (${name})`);
        } else {
            keptRows.push({ id: idCounter++, ...row });
        }
    }

    console.log(`\nSummary:`);
    console.log(`Total rows: ${rows.length}`);
    console.log(`Filtered (Existing): ${filteredRows.length}`);
    console.log(`Kept (New): ${keptRows.length}`);

    const newCsv = Papa.unparse(keptRows);
    fs.writeFileSync(outputFile, newCsv);
    console.log(`Written to ${outputFile}`);

})().catch(console.error);
