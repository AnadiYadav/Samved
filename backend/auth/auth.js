require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ora = require('ora');
const chalk = require('chalk');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();


// Create the spinner with a rocket
const spinner = ora({
    text: '🚀 Launching server...',
    spinner: {
      interval: 120, // how fast the rocket moves
      frames: ['🚀', '🌕', '🚀', '🌖', '🚀', '🌗', '🚀', '🌘', '🚀', '🌑']
    }
  }).start();


// ==================== FILE UPLOAD CONFIG ====================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
            return cb(new Error('Only PDF files are allowed'));
        }
        cb(null, true);
    }
});

// ==================== SECURITY CONFIGURATION ====================
app.use(helmet());
app.use(helmet.hsts({
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
}));

app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "trusted-scripts.nrsc.gov.in"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: [],
  },
}));

// ==================== CORS CONFIGURATION ====================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://127.0.0.1:5500',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With','X-Query-Source']
}));

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.disable('x-powered-by');

// ==================== DATABASE CONNECTION ====================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: 'nrsc_chat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ==================== JWT CONFIGURATION ====================
const JWT_SECRET = process.env.JWT_SECRET || 'nrsc_secure_default_key';
const TOKEN_EXPIRY = '1h';

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticateToken = async (req, res, next) => {
  const token = req.cookies.authToken || req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Authentication token missing' 
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify session exists in database and isn't expired
    const [sessions] = await pool.execute(
      'SELECT * FROM active_sessions WHERE user_id = ? AND session_token = ? AND expires_at > NOW()',
      [decoded.id, token]
    );

    if (sessions.length === 0) {
      // Clear invalid cookie
      res.clearCookie('authToken');
      return res.status(403).json({ 
        success: false,
        message: 'Session expired or invalid' 
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.clearCookie('authToken');
    res.status(403).json({ 
      success: false,
      message: 'Invalid or expired token' 
    });
  }
};

// ==================== ROLE-BASED ACCESS MIDDLEWARE ====================
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (req.user.role !== requiredRole) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient privileges'
        });
      }


      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during role verification'
      });
    }
  };
};


// ==================== CHAT SESSION TRACKING ENDPOINT ====================
app.post('/api/session-start', async (req, res) => {
  try {
    const { session_id, timestamp } = req.body;
    
    if (!session_id || !timestamp) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: session_id and timestamp'
      });
    }

    // Insert new session into database
    await pool.execute(
      `INSERT INTO chat_sessions 
       (session_id, start_time, interaction_count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE
       interaction_count = interaction_count + 1`,
      [session_id, new Date(timestamp)]
    );

    res.json({
      success: true,
      message: 'Session tracking initialized'
    });

  } catch (error) {
    console.error('Session tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize session tracking'
    });
  }
});

// ==================== LOGIN ENDPOINT ====================
app.post('/api/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const [users] = await pool.execute(
      'SELECT id, email, password_hash, role FROM users WHERE email = ? AND is_active = 1',
      [req.body.email]
    );

    if (users.length === 0 || !await bcrypt.compare(req.body.password, users[0].password_hash)) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    const user = users[0];
    
    // Delete existing sessions for this user
    await pool.execute(
      'DELETE FROM active_sessions WHERE user_id = ?',
      [user.id]
    );

    const token = jwt.sign(
      { 
        id: user.id,
        role: user.role,
        iss: 'nrsc-auth-server'
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Store new session in database
    await pool.execute(
      `INSERT INTO active_sessions 
      (user_id, session_token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?)`,
      [
        user.id,
        token,
        req.ip,
        req.headers['user-agent'],
        new Date(Date.now() + 3600000)
      ]
    );

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000,
      path: '/'
    }).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// ==================== LOGOUT ENDPOINT ====================
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    // Delete current session from database
    await pool.execute(
      'DELETE FROM active_sessions WHERE session_token = ?',
      [req.cookies.authToken]
    );

    // Clear authentication cookie
    res.clearCookie('authToken', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    }).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// ==================== SUPERADMIN TOTAL QUERIES ====================
app.get('/api/superadmin/total-queries',
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
        const analyticsResponse = await fetch('http://0.0.0.0:7860/number-of-queries');
        
        if (!analyticsResponse.ok) {
            return res.status(502).json({
                success: false,
                message: `Analytics service error: ${analyticsResponse.status}`
            });
        }

        const analyticsData = await analyticsResponse.json();
        // console.log(analyticsData);
        if (!Array.isArray(analyticsData.nqueries)) {
            return res.status(502).json({
                success: false,
                message: 'Invalid data format from analytics service'
            });
        }

        const totalCount = analyticsData.nqueries.length;

        res.json({
            success: true,
            count: totalCount
        });

    } catch (error) {
        console.error('Superadmin total queries error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// ==================== ADMIN TOTAL QUERIES ====================
app.get('/api/admin/total-queries', 
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
        const analyticsResponse = await fetch('http://0.0.0.0:7860/number-of-queries');
        
        if (!analyticsResponse.ok) {
            return res.status(502).json({
                success: false,
                message: `Analytics service error: ${analyticsResponse.status}`
            });
        }

        const analyticsData = await analyticsResponse.json();
        
        if (!Array.isArray(analyticsData.nqueries)) {
            return res.status(502).json({
                success: false,
                message: 'Invalid data format from analytics service'
            });
        }

        const totalCount = analyticsData.nqueries.length;

        res.json({
            success: true,
            count: totalCount
        });

    } catch (error) {
        console.error('Admin total queries error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});


// ==================== PROTECTED ENDPOINTS ====================

// ==================== ADMIN DATA ENDPOINT ====================
app.get('/api/admin-data', authenticateToken, async (req, res) => {
  try {
      const [user] = await pool.execute(
          'SELECT id, email, role FROM users WHERE id = ?',
          [req.user.id]
      );

      if (user.length === 0) {
          return res.status(404).json({
              success: false,
              message: 'User not found'
          });
      }

      res.json({
          success: true,
          user: {
              id: user[0].id,
              email: user[0].email,
              role: user[0].role
          }
      });
  } catch (error) {
      console.error('Admin data error:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to fetch admin data'
      });
  }
});

// ==================== ACTIVE SESSIONS ENDPOINT ====================
app.get('/api/active-sessions', authenticateToken, requireRole('superadmin'), async (req, res) => {
  try {
    const [results] = await pool.execute(
      `SELECT 
        asess.id, 
        u.email, 
        asess.ip_address, 
        asess.user_agent, 
        asess.created_at,
        asess.expires_at
       FROM active_sessions asess
       JOIN users u ON asess.user_id = u.id
       WHERE asess.expires_at > NOW()`
    );
    
    res.json({
      success: true,
      count: results.length,
      sessions: results.map(session => ({
        id: session.id,
        email: session.email,
        ip: session.ip_address,
        device: session.user_agent,
        loginTime: session.created_at,
        expiresAt: session.expires_at
      }))
    });
  } catch (error) {
    console.error('Active sessions error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve active sessions' 
    });
  }
});

// ==================== ADMIN ACTIVE SESSIONS ENDPOINT ====================
app.get('/api/my-active-sessions', authenticateToken, async (req, res) => {
  try {
    const [results] = await pool.execute(
      `SELECT COUNT(*) AS count FROM active_sessions 
       WHERE user_id = ? AND expires_at > NOW()`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      count: results[0].count
    });
  } catch (error) {
    console.error('Active sessions error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch active sessions' 
    });
  }
});

// ==================== ADMIN APPROVAL STATS ENDPOINT ====================
app.get('/api/my-approval-stats', authenticateToken, async (req, res) => {
  try {
    const [results] = await pool.execute(
      `SELECT 
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
       FROM knowledge_requests 
       WHERE admin_id = ?`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: results[0]
    });
  } catch (error) {
    console.error('Approval stats error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch approval statistics' 
    });
  }
});

// ==================== SUPERADMIN APPROVAL STATS ====================
app.get('/api/superadmin/approval-stats', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
        const [results] = await pool.execute(
            `SELECT 
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
             FROM knowledge_requests`
        );

        res.json({
            success: true,
            data: results[0]
        });
    } catch (error) {
        console.error('Superadmin stats error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch approval statistics' 
        });
    }
});

// ==================== PENDING REQUESTS ENDPOINT ====================

app.get('/api/pending-requests', authenticateToken, requireRole('superadmin'), async (req, res) => {
  try {
    const [requests] = await pool.execute(
      `SELECT ar.id, u.email, ar.requested_role, ar.created_at
       FROM admin_requests ar
       JOIN users u ON ar.requester_id = u.id
       WHERE ar.status = 'pending'`
    );

    res.json({
      success: true,
      requests: requests.map(r => ({
        id: r.id,
        name: r.email,
        type: r.requested_role,
        date: r.created_at
      }))
    });
  } catch (error) {
    console.error('Pending requests error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve pending requests' 
    });
  }
});

//MY PENDING REQUESTS ENDPOINT 

app.get('/api/my-pending-requests', authenticateToken, async (req, res) => {
  try {
    const [results] = await pool.execute(
      'SELECT COUNT(*) AS count FROM knowledge_requests WHERE admin_id = ? AND status = "pending"',
      [req.user.id]
    );
    
    res.json({
      success: true,
      count: results[0].count
    });
  } catch (error) {
    console.error('Pending requests count error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch pending requests' 
    });
  }
});


// ==================== KNOWLEDGE REQUEST ENDPOINTS ====================

// Submit knowledge request
app.post('/api/knowledge-requests', 
  authenticateToken,
  requireRole('admin'),
  upload.single('file'),
  async (req, res) => {
    try {
      // Manual validation since we're using file upload
      const { title, type, description } = req.body;
      const errors = [];

      if (!title || title.length < 5 || title.length > 255) {
        errors.push({
          param: 'title',
          msg: 'Title must be 5-255 characters'
        });
      }

      if (!['text', 'link', 'pdf'].includes(type)) {
        errors.push({
          param: 'type',
          msg: 'Invalid content type'
        });
      }

      if (description && description.length > 500) {
        errors.push({
          param: 'description',
          msg: 'Description too long (max 500 chars)'
        });
      }

      if (errors.length > 0) {
        return res.status(400).json({ 
          success: false,
          errors
        });
      }

      let content = '';
      let filePath = '';
      
      // Handle PDF upload
      if (type === 'pdf') {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: 'PDF file is required'
          });
        }
        filePath = req.file.path;
        content = `PDF:${req.file.filename}`;
      } 
      // Handle text/link content
      else {
        content = req.body.content || '';
        
        if (!content) {
          return res.status(400).json({
            success: false,
            message: 'Content is required'
          });
        }

        // Additional validation for links
        if (type === 'link') {
          try {
            new URL(content);
          } catch (_) {
            return res.status(400).json({
              success: false,
              message: 'Invalid URL format'
            });
          }
        }
      }

      // Insert into database
      await pool.execute(
        `INSERT INTO knowledge_requests 
        (admin_id, title, type, content, description, file_path)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          title,
          type,
          content,
          description || null,
          filePath || null
        ]
      );

      res.json({ 
        success: true,
        message: 'Knowledge request submitted for NRSC approval'
      });

    } catch (error) {
      console.error('NRSC Knowledge submission error:', error);
      
      // Clean up uploaded file if error occurred
      if (req.file?.path) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('NRSC Error cleaning up file:', err);
        });
      }

      res.status(500).json({ 
        success: false,
        message: 'NRSC system: Failed to process request' 
      });
    }
  }
);

// Get user's knowledge requests
app.get('/api/knowledge-requests', 
  authenticateToken, 
  async (req, res) => {
    try {
      const [requests] = await pool.execute(
        `SELECT 
          id, 
          title, 
          type, 
          status, 
          created_at,
          decision_at,
          content
         FROM knowledge_requests 
         WHERE admin_id = ? 
         ORDER BY created_at DESC`,
        [req.user.id]
      );

      // Format response
      const formattedRequests = requests.map(request => ({
        id: request.id,
        title: request.title,
        type: request.type,
        status: request.status,
        date: request.created_at,
        decision_date: request.decision_at,
        content: request.type === 'pdf' ? null : request.content,
        file_url: request.type === 'pdf' ? 
          `/api/knowledge-files/${encodeURIComponent(request.content.replace('PDF:', ''))}` 
          : null
      }));

      res.json({
        success: true,
        requests: formattedRequests
      });
    } catch (error) {
      console.error('NRSC Knowledge request error:', error);
      res.status(500).json({ 
        success: false,
        message: 'NRSC system: Failed to fetch requests' 
      });
    }
  }
);


// Get pending knowledge requests (for superadmin)
app.get('/api/knowledge-requests/pending', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const [requests] = await pool.execute(
        `SELECT 
          kr.id,
          kr.title,
          kr.type,
          kr.content,
          kr.created_at,
          kr.description,
          u.email AS admin_email
         FROM knowledge_requests kr
         JOIN users u ON kr.admin_id = u.id
         WHERE kr.status = 'pending'
         ORDER BY kr.created_at DESC`
      );

      res.json({
        success: true,
        requests
      });
    } catch (error) {
      console.error('NRSC Pending requests error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending requests'
      });
    }
  }
);



// ==================== APPROVE/REJECT KNOWLEDGE REQUEST ====================
app.post('/api/knowledge-requests/:id/:action', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const { id, action } = req.params;
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action'
        });
      }

      // Update request status
      await pool.execute(
        `UPDATE knowledge_requests 
         SET status = ?, decision_by = ?, decision_at = NOW()
         WHERE id = ?`,
        [
          action === 'approve' ? 'approved' : 'rejected',
          req.user.id,
          id
        ]
      );

      // Get the updated request
      const [request] = await pool.execute(
        `SELECT * FROM knowledge_requests WHERE id = ?`,
        [id]
      );

      // PROCESS APPROVED CONTENT ====================
      if (action === 'approve' && request[0]) {
        const requestData = request[0];
        
        if (requestData.type === 'link') {
          // Process link in background
          (async () => {
            try {
              console.log(`\n=== STARTING LINK PROCESSING FOR REQUEST ${id} ===`);
              console.log(`🌐 URL: ${requestData.content}`);
              
              const response = await fetch('http://localhost:3001/proxy/initiate-processing', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ url: requestData.content }),
                timeout: 3600000 // 1 hour timeout
              });

              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const { jobId } = await response.json();
              
              console.log(`🔄 Background processing started with Job ID: ${jobId}`);
              console.log(`📁 Temp files will be stored in backend/temp folder`);

            } catch (error) {
              console.error(`❌ Link processing failed for request ${id}:`, error.message);
            }
          })();

        } else if (requestData.type === 'pdf' && requestData.file_path) {
          // Process PDF in background
          (async () => {
            try {
              console.log(`\n=== STARTING PDF PROCESSING FOR REQUEST ${id} ===`);
              console.log(`📄 File Path: ${requestData.file_path}`);

              // Read PDF file
              const fileBuffer = await fs.promises.readFile(requestData.file_path);
              
              // Send to proxy for processing
              const response = await fetch('http://localhost:3001/proxy/scrape-pdf-file', {
                method: 'POST',
                body: fileBuffer,
                headers: {
                  'Content-Type': 'application/pdf'
                }
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
              }
              
              const result = await response.json();
              console.log(`✅ PDF processing completed: ${result.message}`);
              console.log(`📊 Processed ${result.pages} pages from PDF`);

            } catch (error) {
              console.error(`❌ PDF processing failed for request ${id}:`, error.message);
            }
          })();
        }
      }

      res.json({
        success: true,
        message: `Request ${action}d successfully`,
        filePath: request[0]?.file_path || null
      });

    } catch (error) {
      console.error('NRSC Request action error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process request'
      });
    }
  }
);


// ==================== KNOWLEDGE FILE DOWNLOAD ENDPOINT ====================
app.get('/api/knowledge-files/:filename',
  authenticateToken,
  async (req, res) => {
    try {
      const filename = decodeURIComponent(req.params.filename);
      const filePath = path.join(uploadDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'NRSC error: File not found'
        });
      }

      // Verify the user has permission to access this file
      const [request] = await pool.execute(
        `SELECT kr.admin_id, u.role 
         FROM knowledge_requests kr
         JOIN users u ON kr.admin_id = u.id
         WHERE kr.content = ? AND kr.type = 'pdf'`,
        [`PDF:${filename}`]
      );

      // Allow access for superadmin or the original admin
      if (request.length > 0 && 
          (request[0].admin_id === req.user.id || 
           request[0].role === 'superadmin' || 
           req.user.role === 'superadmin')) {
        res.sendFile(filePath, {
          headers: {
            'Content-Disposition': `inline; filename="${filename}"`
          }
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'NRSC security: Unauthorized access'
        });
      }
    } catch (error) {
      console.error('NRSC File download error:', error);
      res.status(500).json({
        success: false,
        message: 'NRSC system: File retrieval failed'
      });
    }
  }
);

// ==================== ADMIN MANAGEMENT ENDPOINTS ====================

// Create Admin Endpoint (Fixed with proper validation and error handling)
app.post('/api/create-admin', 
  authenticateToken,
  requireRole('superadmin'),
  [
    body('email').isEmail().withMessage('Valid email required')
      .custom(email => email.endsWith('@nrsc.gov.in')).withMessage('Only NRSC official emails allowed'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
      .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
      .matches(/[0-9]/).withMessage('Password must contain at least one number')
      .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character'),
    body('role').isIn(['admin', 'superadmin']).withMessage('Invalid role specified')
  ],
  async (req, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          errors: errors.array().map(e => e.msg)
        });
      }

      const { email, password, role } = req.body;

      // Check if email already exists
      const [existing] = await pool.execute(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Admin with this email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create admin
      await pool.execute(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        [email, hashedPassword, role]
      );

      res.json({
        success: true,
        message: 'Admin created successfully'
      });

    } catch (error) {
      console.error('NRSC Admin creation error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during admin creation'
      });
    }
  }
);


// ==================== VISITOR ANALYTICS ENDPOINT ====================
//For Admin


app.get('/api/visitor-stats', 
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const [results] = await pool.execute(
        `SELECT 
          DATE(start_time) AS date,
          COUNT(*) AS visitors
         FROM chat_sessions
         WHERE start_time >= CURDATE() - INTERVAL 30 DAY
         GROUP BY DATE(start_time)
         ORDER BY date ASC`
      );

      // Fill in missing dates with 0 visitors
      const dateMap = new Map();
      const currentDate = new Date();
      
      // Initialize 30-day map
      for (let i = 29; i >= 0; i--) {
        const date = new Date(currentDate);
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        dateMap.set(dateString, 0);
      }

      // Update with actual data
      results.forEach(row => {
        dateMap.set(row.date.toISOString().split('T')[0], row.visitors);
      });

      const chartData = {
        labels: Array.from(dateMap.keys()).map(date => 
          new Date(date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})
        ),
        data: Array.from(dateMap.values())
      };

      res.json({
        success: true,
        data: chartData
      });

    } catch (error) {
      console.error('Visitor stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch visitor analytics'
      });
    }
  }
);


//====For Superadmin

app.get('/api/superadmin/visitor-stats', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const [results] = await pool.execute(
        `SELECT 
          DATE(start_time) AS date,
          COUNT(*) AS visitors,
          SUM(interaction_count) AS interactions
         FROM chat_sessions
         WHERE start_time >= CURDATE() - INTERVAL 30 DAY
         GROUP BY DATE(start_time)
         ORDER BY date ASC`
      );

      // Fill missing dates
      const dateMap = new Map();
      const currentDate = new Date();
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date(currentDate);
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        dateMap.set(dateString, { visitors: 0, interactions: 0 });
      }

      results.forEach(row => {
        const dateKey = row.date.toISOString().split('T')[0];
        dateMap.set(dateKey, {
          visitors: row.visitors,
          interactions: row.interactions
        });
      });

      const chartData = {
        labels: Array.from(dateMap.keys()).map(date => 
          new Date(date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})
        ),
        datasets: {
          visitors: Array.from(dateMap.values()).map(d => d.visitors),
          interactions: Array.from(dateMap.values()).map(d => d.interactions)
        }
      };

      res.json({
        success: true,
        data: chartData
      });

    } catch (error) {
      console.error('Superadmin visitor error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch visitor analytics'
      });
    }
  }
);




// ==================== ADMIN FAQ ANALYTICS ENDPOINT ====================
app.get('/api/admin/category-stats', 
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      // Fetch category data from analytics service
      const response = await fetch('http://0.0.0.0:7860/category');
      const { nqueries } = await response.json();
      
      // Get current date and 30 days ago
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Define our target categories
      const targetCategories = [
        "Data Products, Services and Policies",
        "EO Missions",
        "Applications",
        "Remote Sensing and GIS",
        "International Collaboration and Cooperation",
        "general-questions"
      ];
      
      // Initialize category counters
      const categoryCounts = {};
      targetCategories.forEach(cat => {
        categoryCounts[cat] = 0;
      });
      
      // Process each query
      for (let i = 0; i < nqueries.time.length; i++) {
        const queryTime = new Date(nqueries.time[i]);
        
        // Filter queries from last 30 days
        if (queryTime >= thirtyDaysAgo) {
          const categories = nqueries.category[i];
          
          // Count each target category
          categories.forEach(cat => {
            if (targetCategories.includes(cat)) {
              categoryCounts[cat]++;
            }
          });
        }
      }
      
      res.json({
        success: true,
        data: {
          labels: targetCategories,
          counts: Object.values(categoryCounts)
        }
      });
      
    } catch (error) {
      console.error('Category stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch category analytics'
      });
    }
  }
);

// ==================== SENTIMENT ANALYSIS ENDPOINT (ADMIN + SUPERADMIN) ====================
// ADMIN SENTIMENT ENDPOINT ==================== 
app.get('/api/admin/sentiment', 
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
        const response = await fetch('http://0.0.0.0:7860/sentiment');
        const { nqueries } = await response.json();
        // Get last 5 sentiment scores (most recent first)
        const latestScores = nqueries.sentiment.slice(-5).reverse();
        
        res.json({
            success: true,
            data: {
                labels: latestScores.map((_, i) => `Score ${i + 1}`),
                scores: latestScores
            }
        });

    } catch (error) {
        console.error('Sentiment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process sentiment data'
        });
    }
});

// ==================== SUPERADMIN SENTIMENT ENDPOINT ====================
app.get('/api/superadmin/sentiment', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
        const response = await fetch('http://0.0.0.0:7860/sentiment');
        const { nqueries } = await response.json();
        const latestScores = nqueries.sentiment.slice(-5).reverse();
        
        res.json({
            success: true,
            data: {
                labels: latestScores.map((_, i) => `Score ${i + 1}`),
                scores: latestScores
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to process data' });
    }
});

// ==================== TOTAL ADMINS ENDPOINT ====================

app.get('/api/total-admins', authenticateToken, requireRole('superadmin'), async (req, res) => {
  try {
      const [results] = await pool.execute(
          'SELECT COUNT(*) AS count FROM users WHERE role IN ("admin", "superadmin")'
      );
      
      res.json({
          success: true,
          count: results[0].count
      });
  } catch (error) {
      console.error('Total admins error:', error);
      res.status(500).json({ 
          success: false,
          message: 'Failed to retrieve admin count' 
      });
  }
});

// ==================== SUPERADMIN REQUEST HISTORY ENDPOINT ====================
app.get('/api/superadmin/request-history', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const [requests] = await pool.execute(
        `SELECT 
          kr.id,
          kr.title,
          kr.type,
          kr.status,
          kr.content,
          kr.description,
          kr.created_at,
          kr.decision_at,
          u1.email AS admin_email,
          u2.email AS decision_by
         FROM knowledge_requests kr
         JOIN users u1 ON kr.admin_id = u1.id
         LEFT JOIN users u2 ON kr.decision_by = u2.id
         WHERE kr.status IN ('approved', 'rejected')
         ORDER BY kr.created_at DESC`
      );

      res.json({
        success: true,
        requests: requests.map(r => ({
          ...r,
          file_name: r.type === 'pdf' ? r.content.replace('PDF:', '') : null
        }))
      });
    } catch (error) {
      console.error('Superadmin history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch request history'
      });
    }
  }
);

// =============== ADMIN REQUEST HISTORY ENDPOINT ===============
app.get('/api/my-request-history', authenticateToken, async (req, res) => {
  try {
    const [requests] = await pool.execute(
      `SELECT 
        kr.id,
        kr.title,
        kr.type,
        kr.status,
        kr.content,
        kr.description,
        kr.file_path,
        kr.created_at,
        kr.decision_at,
        u.email AS decision_by
       FROM knowledge_requests kr
       LEFT JOIN users u ON kr.decision_by = u.id
       WHERE kr.admin_id = ?
       ORDER BY kr.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      requests: requests.map(r => ({
        ...r,
        file_name: r.type === 'pdf' ? r.content.replace('PDF:', '') : null
      }))
    });
  } catch (error) {
    console.error('Request history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch request history'
    });
  }
});

// File: backend\auth\auth.js



// =======================   Processing-History Endpoints

app.post('/api/jobs', authenticateToken, async (req, res) => {
  try {
      const jobData = {
          id: uuidv4(),
          ...req.body,
          start_time: new Date(),
          status: 'processing'
      };

      await pool.execute(
          `INSERT INTO processing_jobs 
          (id, start_time, total_links, processed, success, failed, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
              jobData.id,
              jobData.start_time,
              jobData.total || 0,
              jobData.processed || 0,
              JSON.stringify(jobData.success || []),
              JSON.stringify(jobData.failed || []),
              jobData.status
          ]
      );

      res.json({ success: true, id: jobData.id });
  } catch (error) {
      console.error('Job creation error:', error);
      res.status(500).json({ success: false, message: 'Job tracking failed' });
  }
});

app.patch('/api/jobs/:id', authenticateToken, async (req, res) => {
  try {
      const { processed, success, failed, status } = req.body;
      
      await pool.execute(
          `UPDATE processing_jobs SET
          processed = ?,
          success = ?,
          failed = ?,
          status = ?
          WHERE id = ?`,
          [
              processed,
              JSON.stringify(success),
              JSON.stringify(failed),
              status,
              req.params.id
          ]
      );

      res.json({ success: true });
  } catch (error) {
      console.error('Job update error:', error);
      res.status(500).json({ success: false });
  }
});

app.get('/api/jobs', authenticateToken, async (req, res) => {
  try {
      const [jobs] = await pool.execute(
          'SELECT * FROM processing_jobs ORDER BY start_time DESC'
      );
      
      res.json(jobs.map(job => ({
          ...job,
          success: JSON.parse(job.success),
          failed: JSON.parse(job.failed)
      })));
  } catch (error) {
      console.error('Jobs fetch error:', error);
      res.status(500).json([]);
  }
});

app.delete('/api/jobs/:id', authenticateToken, async (req, res) => {
  try {
      await pool.execute(
          'DELETE FROM processing_jobs WHERE id = ?',
          [req.params.id]
      );
      res.json({ success: true });
  } catch (error) {
      console.error('Job delete error:', error);
      res.status(500).json({ success: false });
  }
});

 // ==================== PROCESSING HISTORY MANAGEMENT ====================
// ==================== PROCESSING JOB MANAGEMENT ====================
// ==================== PROCESSING HISTORY ENDPOINTS ====================


// ==================== PROCESSING HISTORY ENDPOINTS ====================

app.get('/api/processing-jobs', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const processingDir = path.join(__dirname, '..', 'processing_history');
      if (!fs.existsSync(processingDir)) {
        return res.json([]);
      }
      
      const files = fs.readdirSync(processingDir);
      const jobs = [];
      
      files.forEach(file => {
        if (path.extname(file) === '.json') {
          const filePath = path.join(processingDir, file);
          const data = fs.readFileSync(filePath, 'utf8');
          try {
            const job = JSON.parse(data);
            
            // Ensure job has required properties
            if (!job.jobId) job.jobId = file.replace('.json', '');
            if (!job.type) job.type = file.startsWith('pdf-') ? 'pdf' : 'web';
            if (!job.timestamp) job.timestamp = fs.statSync(filePath).mtime.toISOString();
            if (!job.status) job.status = 'unknown';
            if (!job.message) job.message = 'No status message';
            
            jobs.push(job);
          } catch (e) {
            console.error(`Error parsing ${file}:`, e);
          }
        }
      });
      
      // Sort by timestamp (newest first)
      jobs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      res.json(jobs);
      
    } catch (error) {
      console.error('Processing jobs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load processing history'
      });
    }
  }
);


app.delete('/api/processing-jobs/:jobId', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const jobId = req.params.jobId;
      const processingDir = path.join(__dirname, '..', 'processing_history');
      const filePath = path.join(processingDir, `${jobId}.json`);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
      } else {
        res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }
    } catch (error) {
      console.error('Delete job error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete job'
      });
    }
  }
);

// ==================== RETRY JOB ENDPOINT ====================
app.post('/api/processing-jobs/:jobId/retry', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const jobId = req.params.jobId;
      const processingDir = path.join(__dirname, '..', 'processing_history');
      const filePath = path.join(processingDir, `${jobId}.json`);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }
      
      const jobData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (jobData.type !== 'web') {
        return res.status(400).json({
          success: false,
          message: 'Only web jobs can be retried'
        });
      }
      
      // Collect failed and unprocessed links
      const linksToProcess = [];
      
      // Add failed links
      if (jobData.failed && jobData.failed.length > 0) {
        jobData.failed.forEach(failedLink => {
          linksToProcess.push({
            url: failedLink.url,
            type: failedLink.type
          });
        });
      }
      
      // Add unprocessed HTML links
      if (jobData.html && jobData.html.length > 0) {
        jobData.html.forEach(url => {
          // Check if this URL was already processed
          const wasProcessed = jobData.successful?.some(s => s.url === url) || 
                               jobData.failed?.some(f => f.url === url);
          
          if (!wasProcessed) {
            linksToProcess.push({
              url: url,
              type: 'html'
            });
          }
        });
      }
      
      // Add unprocessed PDF links
      if (jobData.pdf && jobData.pdf.length > 0) {
        jobData.pdf.forEach(url => {
          // Check if this URL was already processed
          const wasProcessed = jobData.successful?.some(s => s.url === url) || 
                               jobData.failed?.some(f => f.url === url);
          
          if (!wasProcessed) {
            linksToProcess.push({
              url: url,
              type: 'pdf'
            });
          }
        });
      }
      
      if (linksToProcess.length === 0) {
        return res.json({ 
          success: true,
          message: 'No links to retry'
        });
      }
      
      // Create a new job
      const newJobId = `retry-${Date.now()}`;
      const newJobData = {
        jobId: newJobId,
        sourceUrl: jobData.sourceUrl,
        start_time: new Date().toISOString(),
        status: "processing",
        total: linksToProcess.length,
        processed: 0,
        successful: [],
        failed: [],
        html: [],
        pdf: [],
        message: "Retrying failed and unprocessed links",
        type: 'web'
      };
      
      // Categorize links
      linksToProcess.forEach(link => {
        if (link.type === 'html') {
          newJobData.html.push(link.url);
        } else if (link.type === 'pdf') {
          newJobData.pdf.push(link.url);
        }
      });
      
      const newFilePath = path.join(processingDir, `${newJobId}.json`);
      fs.writeFileSync(newFilePath, JSON.stringify(newJobData, null, 2));
      
      // Start processing using the existing function
      const { processLinks } = require('../proxy-server');
      processLinks(newJobId, newFilePath);
      
      res.json({ 
        success: true,
        jobId: newJobId,
        totalLinks: newJobData.total
      });
      
    } catch (error) {
      console.error('Retry job error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retry job'
      });
    }
  }
);


// ==================== SERVER INITIALIZATION ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
setTimeout(() => {
        spinner.succeed(chalk.green(`NRSC Authentication Server running on port ${PORT}!`));
        // console.log(chalk.cyanBright('Welcome to ISRO Chatbot backend!'));
    }, 1000);
});