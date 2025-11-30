import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Zod Schemas
const ImageSchema = z.object({
  title: z.string(),
  imageUrl: z.string(),
  imageWidth: z.number(),
  imageHeight: z.number(),
  thumbnailUrl: z.string(),
  thumbnailWidth: z.number(),
  thumbnailHeight: z.number(),
  source: z.string(),
  domain: z.string(),
  link: z.string(),
  googleUrl: z.string(),
  position: z.number(),
});

const SearchParametersSchema = z.object({
  q: z.string(),
  type: z.string(),
  num: z.number(),
  engine: z.string(),
});

const SerperResponseSchema = z.object({
  searchParameters: SearchParametersSchema,
  images: z.array(ImageSchema),
});

const API_KEY = 'ef6beabc405d5c4df625dba6f8361977f3a3fd3d';

async function downloadImage(url: string, dest: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(dest, buffer);
}

async function main() {
    const query = 'sailing';
    
    console.log(`Searching for images of "${query}"...`);
    
    const response = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: {
            'X-API-KEY': API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            q: query,
            num: 100
        })
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    
    // Parse with Zod
    const parsed = SerperResponseSchema.parse(json);
    
    console.log(`Found ${parsed.images.length} images.`);

    // Create output directory if it doesn't exist
    const outputDir = 'downloaded_images';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Download first 3 images
    const imagesToDownload = parsed.images.slice(0, 3);
    
    for (let i = 0; i < imagesToDownload.length; i++) {
        const img = imagesToDownload[i];
        
        // Determine extension
        let ext = '.jpg';
        try {
            const urlPath = new URL(img.imageUrl).pathname;
            const detectedExt = path.extname(urlPath);
            if (detectedExt) ext = detectedExt;
        } catch (e) {
            // Fallback to .jpg if URL parsing fails
        }

        const filename = `image_${i + 1}${ext}`;
        const destPath = path.join(outputDir, filename);
        
        console.log(`Downloading ${img.imageUrl} to ${destPath}...`);
        
        try {
            await downloadImage(img.imageUrl, destPath);
            console.log(`Successfully downloaded image ${i + 1}`);
        } catch (error) {
            console.error(`Failed to download image ${i + 1}:`, error);
        }
    }
}

main().catch(console.error);
