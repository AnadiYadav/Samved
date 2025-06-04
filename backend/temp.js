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