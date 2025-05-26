const https = require('https');
const fs = require('fs');
const FormData = require('form-data');

// Update this to the actual path of your PDF file
const filePath = 'C:/Users/HP/Downloads/Name - Anadi Yadav College - JECRC University, Jaipur.pdf';

const form = new FormData();
form.append('file', fs.createReadStream(filePath));

const options = {
  method: 'POST',
  hostname: '8888-01jvz3v9phphmvq0twsmakz8zy.cloudspaces.litng.ai',
  path: '/scrape-pdf-file',
  headers: form.getHeaders()
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

form.pipe(req);
