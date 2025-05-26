const https = require('https');

const data = JSON.stringify({
  url: 'https://bhuvan.nrsc.gov.in/home/index.php'
});


const options = {
  hostname: '8888-01jvz3v9phphmvq0twsmakz8zy.cloudspaces.litng.ai',
  path: '/scrape-url',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('Response:', body);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();
