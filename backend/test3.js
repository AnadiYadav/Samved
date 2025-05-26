const https = require('https');

const data = JSON.stringify({
  url: 'https://www.nrsc.gov.in/sites/default/files/pdf/RD_Activities/Applications/2.pdf',
  'scrape-image': false
});

const options = {
  hostname: '8888-01jvz3v9phphmvq0twsmakz8zy.cloudspaces.litng.ai',
  path: '/scrape-pdf',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('✅ Response:', body);
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
});

req.write(data);
req.end();
