const http = require('http');

const options = {
  hostname: '0.0.0.0',
  port: 7860,
  path: '/category',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('✅ Response:', data);
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
});

req.end();
