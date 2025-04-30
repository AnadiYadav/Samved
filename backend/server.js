require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('./auth/auth');
const superadminRoutes = require('./routes/superadmin');

const app = express();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5500',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate Limiting (ISRO Security Standard: 100 requests/15min)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

// Body Parsing with Size Limit
app.use(express.json({ limit: '10kb' }));

// Routes
app.use('/api', authMiddleware.verifyToken);
app.use('/api/superadmin', authMiddleware.requireRole('superadmin'), superadminRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('ISRO Dashboard Error:', err);
  res.status(500).json({ 
    success: false,
    message: 'Internal Server Error - NRSC Security Team Notified'
  });
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`NRSC Dashboard API running on port ${PORT}`);
});