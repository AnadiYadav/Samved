const express = require('express');
const cors = require('cors');
const app = express();
const ora = require('ora');
const chalk = require('chalk');


app.use(cors());
app.use(express.json());

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


// Add these endpoints AFTER the existing /proxy/ask endpoint but BEFORE app.listen()

// New endpoint for scrape-url
app.post('/proxy/scrape-url', async (req, res) => {
    try {
        const response = await fetch('http://0.0.0.0:7860/scrape-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        console.log('Scrape-URL Response:', data); // Log the response
        res.json(data);
    } catch (error) {
        console.error('Scrape-URL Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// New endpoint for scrape-page
app.post('/proxy/scrape-page', async (req, res) => {
    try {
        const response = await fetch('http://0.0.0.0:7860/scrape-page', {
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

// New endpoint for scrape-pdf
app.post('/proxy/scrape-pdf', async (req, res) => {
    try {
        const response = await fetch('http://0.0.0.0:7860/scrape-pdf', {
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

// New endpoint for scrape-pdf-file
app.post('/proxy/scrape-pdf-file', async (req, res) => {
    try {
        const response = await fetch('http://0.0.0.0:7860/scrape-pdf-file', {
            method: 'POST',
            body: req.body
        });
        res.json(await response.json());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



app.listen(3001, () => {
    setTimeout(() => {
        spinner.succeed(chalk.green(`Proxy Server running on port 3001!`));
        // console.log(chalk.cyanBright('Welcome to ISRO Chatbot backend!'));
    }, 1000);
});