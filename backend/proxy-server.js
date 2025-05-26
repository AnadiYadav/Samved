const express = require('express');
const cors = require('cors');
const app = express();
const ora = require('ora');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const Undici = require('undici');

// Add this map to track active jobs
const activeJobs = new Map();


app.use(cors());
app.use(express.json());

// Create the spinner with a rocket
const spinner = ora({
    text: '🚀 Launching server...',
    spinner: {
      interval: 120, // how fast the rocket moves
      frames: ['🚀', '🌕', '🚀', '🌖', '🚀', '🌗', '🚀', '🌘', '🚀', '🌑']
    }
  }).start();

app.post('/proxy/ask', async (req, res) => {
    try {
        const response = await fetch('http://0.0.0.0:7860/ask', {
        // const response = await fetch('https://7860-01jsbrn78sydwxvkhr021tsz56.cloudspaces.litng.ai/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        res.json(await response.json());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Add these endpoints AFTER the existing /proxy/ask endpoint but BEFORE app.listen()

// New endpoint for scrape-url
app.post('/proxy/scrape-url', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3600000); // 1 hour timeout
        
        const response = await fetch('http://0.0.0.0:7860/scrape-url', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(req.body),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await response.json();
        console.log('Scrape-URL Response:', data);
        res.json(data);
    } catch (error) {
        console.error('Scrape-URL Error:', error);
        res.status(500).json({ 
            error: error.name === 'AbortError' ? 
            'Request timed out after 1 hour' : 
            error.message 
        });
    }
});

app.post('/proxy/scrape-page', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3600000);
        
        const response = await fetch('http://0.0.0.0:7860/scrape-page', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                url: req.body.url,
                'scrape-images': false 
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        res.json(await response.json());
    } catch (error) {
        res.status(500).json({ 
            error: error.name === 'AbortError' ? 
            'Processing timeout' : 
            error.message 
        });
    }
});

app.post('/proxy/scrape-pdf', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3600000);
        
        const response = await fetch('http://0.0.0.0:7860/scrape-pdf', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                url: req.body.url,
                'scrape-image': false 
             }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        res.json(await response.json());
    } catch (error) {
        res.status(500).json({ 
            error: error.name === 'AbortError' ? 
            'PDF processing timeout' : 
            error.message 
        });
    }
});

// New endpoint for scrape-pdf-file
app.post('/proxy/scrape-pdf-file', async (req, res) => {
    try {
        const response = await fetch('http://0.0.0.0:7860/scrape-pdf-file', {
            method: 'POST',
            body: req.body
        });
        res.json(await response.json());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// New endpoint to initiate processing
app.post('/proxy/initiate-processing', async (req, res) => {
    try {
        const { url } = req.body;
        const jobId = `job-${Date.now()}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tempFilePath = path.join(__dirname, 'temp', `${jobId}-${timestamp}.json`);

        // Create temp directory if not exists
        if (!fs.existsSync(path.join(__dirname, 'temp'))) {
            fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
        }

        // Step 1: Get links
        const linksResponse = await fetch('http://0.0.0.0:7860/scrape-url', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ url }),
            dispatcher: new Undici.Agent({
                headersTimeout: 3600000,
                bodyTimeout: 3600000
            })
        });

        const { pdf_links = [], all_links = [] } = await linksResponse.json();
        
        // Save links to temp file
        fs.writeFileSync(tempFilePath, JSON.stringify({
            pdf: pdf_links,
            html: all_links,
            processed: 0,
            total: pdf_links.length + all_links.length,
            start_time: new Date().toISOString(),
            status: 'processing'
        }, null, 2));

        // Start background processing
        processLinks(jobId, tempFilePath);

        res.json({ 
            jobId,
            tempFilePath,
            totalLinks: pdf_links.length + all_links.length
        });
        
        console.log(`\n=== NEW PROCESSING JOB ${jobId} ===`);
        console.log(`🌐 Source URL: ${url}`);
        console.log(`📁 Temp file: ${tempFilePath}`);

    } catch (error) {
        console.error('Initiation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Background processing function 
// Background processing function - UPDATED WITH FETCH
async function processLinks(jobId, filePath) {
    try {
        const jobData = JSON.parse(fs.readFileSync(filePath));
        let processedCount = 0;

        const processLink = async (url, type) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3600000);

                // Match test2.js/test3.js parameters
                const bodyData = JSON.stringify({
                    url,
                    ...(type === 'html' ? { 'scrape-images': false } : { 'scrape-image': false })
                });

                const response = await fetch(`http://0.0.0.0:7860/${type === 'pdf' ? 'scrape-pdf' : 'scrape-page'}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(bodyData)
                    },
                    body: bodyData,
                    signal: controller.signal,
                    dispatcher: new Undici.Agent({
                        headersTimeout: 3600000,
                        bodyTimeout: 3600000
                    })
                });

                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                await response.json();

                processedCount++;
                console.log(`✅ [${jobId}] Processed ${type.toUpperCase()} ${processedCount}/${jobData.total}: ${url}`);
                
                // Update progress file
                fs.writeFileSync(filePath, JSON.stringify({
                    ...jobData,
                    processed: processedCount
                }));

            } catch (error) {
                console.error(`❌ [${jobId}] Failed ${type.toUpperCase()} ${processedCount + 1}/${jobData.total}: ${url}\nREASON: ${error.message}`);
                throw error;
            }
        };

        // Process HTML links
        for (const url of jobData.html) {
            await processLink(url, 'html');
        }

        // Process PDF links
        for (const url of jobData.pdf) {
            await processLink(url, 'pdf');
        }

        console.log(`\n=== JOB COMPLETE ${jobId} ===`);
        console.log(`✅ Successfully processed ${processedCount}/${jobData.total} links`);
        console.log(`📁 Temp file preserved at: ${filePath}`);

    } catch (error) {
        console.error(`\n‼️ JOB FAILED ${jobId}: ${error.message}`);
        // Temp file remains for debugging
    }
}



app.listen(3001, () => {
    setTimeout(() => {
        spinner.succeed(chalk.green(`Proxy Server running on port 3001!`));
        // console.log(chalk.cyanBright('Welcome to ISRO Chatbot backend!'));
    }, 1000);
});