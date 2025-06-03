const fs = require('fs');
const path = require('path');
const urlsFilePath = path.join(__dirname, 'Urls.json');

const initialUrls = [
    "https://www.isro.gov.in/",
    "https://nrsc.gov.in/",
    "https://ursc.gov.in/",
    "https://www.isro.gov.in/PSLV.html",
    "https://www.isro.gov.in/GSLV.html",
    "https://www.isro.gov.in/Spacecraft.html",
    "https://www.isro.gov.in/centres",
    "https://www.isro.gov.in/education",
    "https://www.isro.gov.in/technology-transfer",
    "https://www.isro.gov.in/innovation"
];

function initializeUrls() {
    let existingUrls = [];
    
    try {
        if (fs.existsSync(urlsFilePath)) {
            existingUrls = JSON.parse(fs.readFileSync(urlsFilePath));
        }
    } catch (error) {
        console.error('Error loading existing URLs:', error);
    }

    // Add new URLs
    const newUrls = initialUrls.filter(url => 
        !existingUrls.some(u => u.url === url)
    );

    if (newUrls.length > 0) {
        const now = new Date();
        
        newUrls.forEach((url, i) => {
            // Calculate next scrape time
            const nextDate = new Date(now);
            nextDate.setDate(now.getDate() + 15);
            nextDate.setUTCHours(2 + (i % 5), 0, 0, 0); // Stagger hours
            
            existingUrls.push({
                url,
                nextScrape: nextDate.toISOString(),
                interval: 15, // Default interval
                retryCount: 0
            });
        });

        fs.writeFileSync(urlsFilePath, JSON.stringify(existingUrls, null, 2));
        console.log(`Added ${newUrls.length} initial URLs`);
    }
}

// Run initialization
initializeUrls();