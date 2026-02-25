const fs = require('fs');

const BATCH_SIZE = 10;

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

        try {
            const input = JSON.stringify({ urls: batch });
            const url = `https://crisp-lamps-rest.app.taylordb.ai/api/trpc/domains.matchUrls?input=${encodeURIComponent(input)}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.error(`API Error: ${response.status} ${response.statusText}`);
                const text = await response.text();
                console.error(text);
                continue;
            }

            const json = await response.json();
            
            // Handle tRPC response structure
            let results = [];
            if (json.result && json.result.data && json.result.data.results) {
                results = json.result.data.results;
            } else if (json.results) {
                results = json.results;
            }

            for (const res of results) {
                if (res.matched) {
                    matchedDomains.add(res.url);
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

        console.log(`[Batch ${batchIndex}/${totalBatches}] Finished in ${batchDuration.toFixed(1)}s. Processed ${processedCount}/${uniqueUrls.length} URLs. Estimated time remaining: ${estimatedRemainingTimeSec}s`);
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
