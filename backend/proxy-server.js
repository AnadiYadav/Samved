const express = require('express');
const cors = require('cors');
const app = express();
const ora = require('ora');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const Undici = require('undici');
const FormData = require('form-data');
const { Readable } = require('stream');
const http = require('http');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cron = require('node-cron');

const DEFAULT_INTERVAL = 15; // Default days between scrapes
const MIN_HOUR_GAP = 10; // Minimum hours between scrapes

// Add this map to track active jobs
const activeJobs = new Map();


app.use(cors());
app.use(express.json());
app.use(express.raw({ type: 'application/pdf', limit: '500mb' })); // For PDF handling

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


// ==================== PDF PROCESSING HISTORY ====================
// Create processing_history directory if not exists
const processingHistoryDir = path.join(__dirname, 'processing_history');
if (!fs.existsSync(processingHistoryDir)) {
  fs.mkdirSync(processingHistoryDir, { recursive: true });
}

// ==================== SCRAPE PDF FILE ENDPOINT ====================
app.post('/proxy/scrape-pdf-file', async (req, res) => {
  const spinner = ora({
    text: 'Processing PDF file',
    spinner: {
      interval: 100,
      frames: ['▰▱▱▱▱▱▱', '▰▰▱▱▱▱▱', '▰▰▰▱▱▱▱', '▰▰▰▰▱▱▱', 
               '▰▰▰▰▰▱▱', '▰▰▰▰▰▰▱', '▰▰▰▰▰▰▰', '✅']
    }
  }).start();

  let jobId, filename;
  
  try {
    jobId = `pdf-${Date.now()}`;
    filename = `nrsc-pdf-${Date.now()}.pdf`;
    
    // Track processing start
    await trackPdfProcessing(jobId, filename, 'processing', 'Starting PDF processing');
    
    // Create a readable stream from the buffer
    const bufferStream = new Readable();
    bufferStream.push(req.body);
    bufferStream.push(null);

    // Create form data
    const form = new FormData();
    form.append('file', bufferStream, {
      filename: filename,
      contentType: 'application/pdf'
    });

    spinner.text = 'Sending to processing service';
    
    // Forward to backend with 2-hour timeout
    const response = await fetch('http://0.0.0.0:7860/scrape-pdf-file', {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      dispatcher: new Undici.Agent({
        headersTimeout: 7200000, // 2 hours
        bodyTimeout: 7200000     // 2 hours
      })
    });

    // Handle response
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    // Track successful processing
    await trackPdfProcessing(
      jobId, 
      filename, 
      'completed', 
      'PDF processing completed'
    );
    
    spinner.succeed('PDF processed successfully');
    res.json(result);
    
  } catch (error) {
    spinner.fail(`PDF processing failed: ${error.message}`);
    console.error('PDF Processing Error:', error);
    
    // Track failed processing
    if (jobId) {
      await trackPdfProcessing(
        jobId, 
        filename || 'unknown.pdf', 
        'failed', 
        error.message
      );
    }
    
    res.status(500).json({ 
      error: error.message || 'PDF processing failed' 
    });
  }
});

// ==================== PDF PROCESSING TRACKING ====================
async function trackPdfProcessing(jobId, filename, status, message, pages = 0) {
  const jobData = {
    jobId,
    filename,
    status,
    message,
    pages,
    timestamp: new Date().toISOString(),
    type: 'pdf'
  };
  
  const jobFilePath = path.join(processingHistoryDir, `${jobId}.json`);
  fs.writeFileSync(jobFilePath, JSON.stringify(jobData, null, 2));
  return jobData;
}







// ==================== INITIATE PROCESSING ENDPOINT ====================
app.post('/proxy/initiate-processing', async (req, res) => {
  try {
    const { url } = req.body;
    const jobId = `web-${Date.now()}`;
    
    // Create processing_history directory if not exists
    if (!fs.existsSync(processingHistoryDir)) {
      fs.mkdirSync(processingHistoryDir, { recursive: true });
    }
    
    const jobFilePath = path.join(processingHistoryDir, `${jobId}.json`);

    // Step 1: Get links
    const linksResponse = await fetch('http://0.0.0.0:7860/scrape-url', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ url }),
      dispatcher: new Undici.Agent({
        headersTimeout: 7200000, // 2 hours
        bodyTimeout: 7200000     // 2 hours
      })
    });

    const { pdf_links = [], all_links = [] } = await linksResponse.json();
    
    // Initialize job data with new structure
   const jobData = {
      jobId,
      sourceUrl: url,
      start_time: new Date().toISOString(),
      status: "processing",
      total: pdf_links.length + all_links.length,
      processed: 0,
      successful: [],
      failed: [],
      html: all_links,
      pdf: pdf_links,
      message: "Processing initiated",
      type: 'web'
    };

    // Save job data
    fs.writeFileSync(jobFilePath, JSON.stringify(jobData, null, 2));

    // Start background processing
    processLinks(jobId, jobFilePath);

    // Add to automated scraping schedule
    addUrlToSchedule(url);

    res.json({ 
      jobId,
      totalLinks: jobData.total
    });
    
    console.log(`\n=== NEW PROCESSING JOB ${jobId} ===`);
    console.log(`🌐 Source URL: ${url}`);

  } catch (error) {
    console.error('Initiation Error:', error);
    res.status(500).json({ error: error.message });
  }
});



// Background processing function 
async function processLinks(jobId, filePath) {
    try {
        // Read initial job data
        let jobData = JSON.parse(fs.readFileSync(filePath));
        
        // Initialize tracking arrays
        jobData.successful = jobData.successful || [];
        jobData.failed = jobData.failed || [];
        jobData.status = "processing";
        jobData.start_time = new Date().toISOString();
        
        // Update file with initial status
        fs.writeFileSync(filePath, JSON.stringify(jobData, null, 2));

        let consecutiveFailures = 0; // Track consecutive failures
        
        // Progress bar function
        const renderProgressBar = (current, total, barLength = 20) => {
            const progress = Math.min(current / total, 1);
            const filled = Math.round(barLength * progress);
            const empty = barLength - filled;
            return `[${'='.repeat(filled)}${' '.repeat(empty)}] ${Math.floor(progress * 100)}%`;
        };

        const processLink = async (url, type) => {
            let attempts = 0;
            let success = false;
            let errorMessage = "";
            
            while (attempts < 3 && !success) {
                attempts++;
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3600000);

                    const bodyData = JSON.stringify({
                        url,
                        ...(type === 'html' ? { 'scrape-images': false } : { 'scrape-image': false })
                    });

                    // Show progress bar for this attempt
                    const currentProcessed = jobData.successful.length + jobData.failed.length;
                    const progressBar = renderProgressBar(currentProcessed, jobData.total);
                    console.log(`\n[${jobId}] ${progressBar} Processing ${type.toUpperCase()} ${currentProcessed + 1}/${jobData.total}`);
                    console.log(`🔗 URL: ${url}`);
                    console.log(`🔄 Attempt ${attempts}/3...`);

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
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
                    }
                    
                    await response.json();
                    success = true;
                    consecutiveFailures = 0; // Reset on success
                    
                    // Show success indicator
                    console.log(`✅ Successfully processed ${type.toUpperCase()}`);
                    
                } catch (error) {
                    errorMessage = error.message;
                    console.error(`❌ Attempt ${attempts} failed: ${error.message}`);
                    
                    // Show failure indicator
                    if (attempts === 3) console.log(`❌❌❌ Failed after 3 attempts`);
                    
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
            
            return { success, attempts, error: errorMessage };
        };

        // Process HTML links
        for (let i = 0; i < jobData.html.length; i++) {
            if (consecutiveFailures >= 2) {
                jobData.status = "failed";
                jobData.message = "Processing stopped due to consecutive failures";
                fs.writeFileSync(filePath, JSON.stringify(jobData, null, 2));
                console.error(`‼️ [${jobId}] Stopping processing due to consecutive failures`);
                break;
            }
            
            const url = jobData.html[i];
            const result = await processLink(url, 'html');
            
            if (result.success) {
                jobData.successful.push({
                    url,
                    type: 'html',
                    attempts: result.attempts,
                    timestamp: new Date().toISOString()
                });
            } else {
                jobData.failed.push({
                    url,
                    type: 'html',
                    attempts: result.attempts,
                    error: result.error,
                    timestamp: new Date().toISOString()
                });
                consecutiveFailures++;
            }
            
            // Update progress in temp file
            jobData.processed = jobData.successful.length + jobData.failed.length;
            fs.writeFileSync(filePath, JSON.stringify(jobData, null, 2));
        }
        
        // Process PDF links only if not stopped
        if (consecutiveFailures < 2) {
            for (let i = 0; i < jobData.pdf.length; i++) {
                if (consecutiveFailures >= 2) {
                    jobData.status = "failed";
                    jobData.message = "Processing stopped due to consecutive failures";
                    fs.writeFileSync(filePath, JSON.stringify(jobData, null, 2));
                    console.error(`‼️ [${jobId}] Stopping processing due to consecutive failures`);
                    break;
                }
                
                const url = jobData.pdf[i];
                const result = await processLink(url, 'pdf');
                
                if (result.success) {
                    jobData.successful.push({
                        url,
                        type: 'pdf',
                        attempts: result.attempts,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    jobData.failed.push({
                        url,
                        type: 'pdf',
                        attempts: result.attempts,
                        error: result.error,
                        timestamp: new Date().toISOString()
                    });
                    consecutiveFailures++;
                }
                
                // Update progress in temp file
                jobData.processed = jobData.successful.length + jobData.failed.length;
                fs.writeFileSync(filePath, JSON.stringify(jobData, null, 2));
            }
        }
        
        // Final status update
        if (jobData.status === "processing") {
            if (jobData.failed.length === 0) {
                jobData.status = "completed";
                jobData.message = "All links processed successfully";
            } else {
                jobData.status = "partially_completed";
                jobData.message = `Processed with ${jobData.failed.length} failures`;
            }
        }
        
        jobData.end_time = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(jobData, null, 2));
        
        // Show final progress bar
        const finalProgressBar = renderProgressBar(jobData.processed, jobData.total);
        console.log(`\n[${jobId}] ${finalProgressBar} JOB ${jobData.status.toUpperCase()}`);
        console.log(`📝 Message: ${jobData.message}`);
        console.log(`✅ Successful: ${jobData.successful.length}`);
        console.log(`❌ Failed: ${jobData.failed.length}`);
        console.log(`📁 Log file preserved at: ${filePath}`);

    } catch (error) {
        console.error(`\n‼️ JOB FAILED ${jobId}: ${error.message}`);
        // Update temp file with error status
        try {
            const jobData = JSON.parse(fs.readFileSync(filePath));
            jobData.status = "failed";
            jobData.message = `Unhandled error: ${error.message}`;
            jobData.end_time = new Date().toISOString();
            fs.writeFileSync(filePath, JSON.stringify(jobData, null, 2));
        } catch (e) {
            console.error('Failed to update temp file:', e);
        }
    }
}




// ==================== URL SCHEDULING SYSTEM ====================
const urlsFilePath = path.join(__dirname, 'Urls.json');


// Domain-specific scraping intervals (in days)
const CUSTOM_INTERVALS = {
    'nrsc.gov.in': 10,    // Every 10 days
    'ursc.gov.in': 30,    // Every 30 days
    'isac.gov.in': 20,    // Every 20 days
    'isro.gov.in': 15,    // Every 15 days
    // Add more domains as needed
};

// Initialize URL tracking
let urlSchedule = [];

// Load existing URLs
function loadUrls() {
    try {
        if (fs.existsSync(urlsFilePath)) {
            urlSchedule = JSON.parse(fs.readFileSync(urlsFilePath));
            console.log(`Loaded ${urlSchedule.length} URLs from schedule`);
        }
    } catch (error) {
        console.error('Error loading URL schedule:', error);
    }
}

// Save URLs to file
function saveUrls() {
    try {
        fs.writeFileSync(urlsFilePath, JSON.stringify(urlSchedule, null, 2));
    } catch (error) {
        console.error('Error saving URL schedule:', error);
    }
}

// Calculate next scrape time with minimum gap
function calculateNextScrape() {
    const now = new Date();
    let nextDate = new Date(now);
    
    // Find last scheduled time
    if (urlSchedule.length > 0) {
        const lastScrape = new Date(Math.max(...urlSchedule.map(u => new Date(u.nextScrape))));
        if (lastScrape > nextDate) nextDate = lastScrape;
    }
    
    // Add minimum gap
    nextDate = new Date(nextDate.getTime() + MIN_HOUR_GAP * 60 * 60 * 1000);
    
    // Adjust to night hours (10 PM - 4 AM IST)
    const utcHour = nextDate.getUTCHours();
    if (utcHour > 4 && utcHour < 18) {
        nextDate.setUTCHours(22); // 10 PM IST (4:30 PM UTC)
    }
    
    return nextDate;
}

// Add new URL to schedule
function addUrlToSchedule(url) {
    // Check if URL already exists
    const existingIndex = urlSchedule.findIndex(u => u.url === url);
    
    if (existingIndex > -1) {
        console.log(`URL ${url} already scheduled`);
        return;
    }

    // Get custom interval for URL
    let interval = DEFAULT_INTERVAL;
    for (const [domain, customInterval] of Object.entries(CUSTOM_INTERVALS)) {
        if (url.includes(domain)) {
            interval = customInterval;
            break;
        }
    }

    const newEntry = {
        url,
        nextScrape: calculateNextScrape().toISOString(),
        interval,
        retryCount: 0
    };

    urlSchedule.push(newEntry);
    saveUrls();
    console.log(`Added ${url} with ${interval}-day interval. Next scrape: ${newEntry.nextScrape}`);
}

// Schedule cron job to check URLs daily
cron.schedule('0 0 * * *', () => {
    const now = new Date();
    console.log(`\n=== DAILY URL CHECK (${now.toISOString()}) ===`);
    console.log(`Checking ${urlSchedule.length} scheduled URLs...`);
    
    urlSchedule.forEach(async (entry, index) => {
        if (new Date(entry.nextScrape) <= now) {
            console.log(`\nScraping ${entry.url}...`);
            try {
                // Perform scraping
                const response = await fetch('http://0.0.0.0:7860/scrape-url', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ url: entry.url }),
                    timeout: 3600000 // 1 hour timeout
                });
                
                if (response.ok) {
                    // Successful scrape - reschedule with URL's specific interval
                    const nextDate = new Date(
                        now.getTime() + entry.interval * 24 * 60 * 60 * 1000
                    );
                    
                    urlSchedule[index].nextScrape = nextDate.toISOString();
                    urlSchedule[index].retryCount = 0;
                    console.log(`✅ Success. Next scrape in ${entry.interval} days: ${nextDate.toISOString()}`);
                } else {
                    // Handle failure
                    const errorText = await response.text();
                    console.error(`❌ Failed to scrape: ${errorText}`);
                    urlSchedule[index].retryCount++;
                    urlSchedule[index].nextScrape = new Date(
                        now.getTime() + 60 * 60 * 1000 // Retry in 1 hour
                    ).toISOString();
                    console.log(`🔄 Retry scheduled in 1 hour`);
                }
            } catch (error) {
                console.error(`❌ Network error: ${error.message}`);
                urlSchedule[index].retryCount++;
                urlSchedule[index].nextScrape = new Date(
                    now.getTime() + 60 * 60 * 1000 // Retry in 1 hour
                ).toISOString();
                console.log(`🔄 Retry scheduled in 1 hour`);
            }
            
            saveUrls();
        }
    });
});

// Initial load
loadUrls();




app.listen(3001, () => {
    setTimeout(() => {
        spinner.succeed(chalk.green(`Proxy Server running on port 3001!`));
        // console.log(chalk.cyanBright('Welcome to ISRO Chatbot backend!'));
    }, 1000);
});

module.exports = {
  processLinks
};