const https = require('https');

const data = JSON.stringify({
  query: "What is the main topic of nrsc",
  session_id: "user123_chat789"
});

const options = {
  hostname: '8888-01jvz3v9phphmvq0twsmakz8zy.cloudspaces.litng.ai',
  path: '/ask',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let responseBody = '';

  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    console.log('✅ Response:', responseBody);
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
});

req.write(data);
req.end();
