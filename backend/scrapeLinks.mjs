import fetch from 'node-fetch';

// 🔗 Links to send
const links = [
    'https://www.inspace.gov.in/inspace?id=inspace_about_inspace',
    'https://www.inspace.gov.in/inspace?id=inspace_nge_proposal_page'
];

// 🔗 Base API endpoint
const SCRAPE_BASE_URL = 'http://0.0.0.0:7860';

async function sendLinks() {
    console.log(`📦 Sending ${links.length} links to /scrape-page...`);

    for (let i = 0; i < links.length; i++) {
        const link = links[i];

        try {
            const response = await fetch('http://0.0.0.0:7860/scrape-page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  url: link,
                  'scrape-images': false
                })
              });
              

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }

            const data = await response.json();
            const percent = ((i + 1) / links.length * 100).toFixed(2);
            console.log(`✅ [${percent}%] Processed: ${link}`);
        } catch (error) {
            console.error(`❌ Error processing ${link}:`, error.message);
        }
    }

    console.log('🎉 All links processed.');
}

sendLinks();
