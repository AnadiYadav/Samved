import fetch from 'node-fetch';

// 🔗 Links to send
// 'https://www.inspace.gov.in/inspace?id=inspace_about_inspace',
// 'https://www.inspace.gov.in/inspace?id=inspace_nge_proposal_page',
const links = [
    'https://www.nrsc.gov.in/sites/default/files/pdf/Careers/application_form_for_NRSC_RMT-3-2023.pdf',
    'https://www.nrsc.gov.in/sites/default/files/pdf/Announcements/Caution%20for%20Job%20Seekers-%20Fake%20Recruitment%20Notices%20&%20Appointment%20Offers.pdf'
];

// 🔗 Base API endpoint
const SCRAPE_BASE_URL = 'http://0.0.0.0:7860';

async function sendLinks() {
    console.log(`📦 Sending ${links.length} links to /scrape-page...`);

    for (let i = 0; i < links.length; i++) {
        const link = links[i];

        try {
            const response = await fetch('http://0.0.0.0:7860/scrape-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  url: link,
                  'scrape-image': false
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
