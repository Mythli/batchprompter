import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

const API_TOKEN = 'a40d157a5b06b8f7e162b70e944632de699c5fc41e722541a3ad6bf179a95d06';
const ZONE = 'serp_api1';

// Define Zod schemas based on the provided sample
const ImageEntrySchema = z.object({
    link: z.string().optional(), // Often the page URL
    original_image: z.string().optional(), // The high-res image URL
    image: z.string().optional(), // Sometimes the image URL or thumbnail
    title: z.string().optional(),
    source: z.string().optional()
});

const SerpResponseSchema = z.object({
    general: z.any().optional(),
    images: z.array(ImageEntrySchema).optional().nullable()
});

async function main() {
    console.log('Sending request to Bright Data...');

    const response = await fetch('https://api.brightdata.com/request', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_TOKEN}`
        },
        body: JSON.stringify({
            zone: ZONE,
            url: 'https://www.google.com/search?q=bouldering&tbm=isch',
            format: 'json'
        })
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${await response.text()}`);
    }

    const rawData = await response.json();
    
    // Parse and validate response with Zod
    let parsedData;
    try {
        parsedData = SerpResponseSchema.parse(rawData);
    } catch (error) {
        console.error('Response validation failed:', error);
        return;
    }
    
    const images = parsedData.images;

    if (!images || images.length === 0) {
        console.error('No images found in the response.');
        return;
    }

    console.log(`Found ${images.length} images. Downloading top 3...`);

    const top3 = images.slice(0, 3);
    const outputDir = 'downloads';

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    for (let i = 0; i < top3.length; i++) {
        const imgEntry = top3[i];
        
        // Prioritize original_image, then image, then link based on sample data
        const imageUrl = imgEntry.original_image || imgEntry.image || imgEntry.link;

        if (!imageUrl) {
            console.log(`Skipping image ${i + 1}: No URL found.`);
            continue;
        }

        try {
            console.log(`Downloading image ${i + 1}: ${imageUrl}`);
            const imgResponse = await fetch(imageUrl);
            
            if (!imgResponse.ok) {
                console.error(`Failed to fetch image ${imageUrl}: ${imgResponse.statusText}`);
                continue;
            }

            const buffer = Buffer.from(await imgResponse.arrayBuffer());
            
            // Try to guess extension or default to .jpg
            let ext = '.jpg';
            const contentType = imgResponse.headers.get('content-type');
            if (contentType) {
                if (contentType.includes('png')) ext = '.png';
                else if (contentType.includes('gif')) ext = '.gif';
                else if (contentType.includes('webp')) ext = '.webp';
                else if (contentType.includes('jpeg')) ext = '.jpg';
            }

            const filePath = path.join(outputDir, `bouldering_${i + 1}${ext}`);
            fs.writeFileSync(filePath, buffer);
            console.log(`Saved to ${filePath}`);

        } catch (error) {
            console.error(`Error downloading image ${i + 1}:`, error);
        }
    }
}

main().catch(err => console.error(err));
