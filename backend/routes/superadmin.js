const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const validator = require('../validators/admin.validator.js');
const mysql = require('mysql2/promise');

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: 'nrsc_chat',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// GET Active Sessions (Real ISRO Data)
router.get('/active-sessions', async (req, res) => {
    try {
        const [results] = await pool.query(
            `SELECT COUNT(*) AS active_count 
             FROM active_sessions 
             WHERE expires_at > NOW()`
        );
        
        res.json({
            success: true,
            count: results[0].active_count,
            sessions: [] // Maintain existing structure
        });
    } catch (error) {
        console.error('NRSC Session Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve ISRO session data'
        });
    }
});

// GET Pending Requests (Real NRSC Data)
router.get('/pending-requests', async (req, res) => {
    try {
        const [requests] = await pool.query(
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
                type: `Role: ${r.requested_role}`,
                date: r.created_at,
                department: 'NRSC' // Maintain existing field
            }))
        });
    } catch (error) {
        console.error('NRSC Request Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve NRSC pending requests'
        });
    }
});

// POST Create Admin (Secure NRSC Workflow)
router.post('/create-admin', 
  validator.validateAdminCreation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array().map(e => e.msg)
        });
    }

    try {
        // ISRO Email Domain Validation
        if (!req.body.email.endsWith('@nrsc.gov.in')) {
            return res.status(400).json({
                success: false,
                message: 'Only official NRSC email addresses allowed'
            });
        }

        // Secure database insertion
        await pool.query(
            `INSERT INTO admin_requests 
            (requester_id, email, requested_role)
            VALUES (?, ?, ?)`,
            [
                req.user.id, // From authentication middleware
                req.body.email,
                req.body.role
            ]
        );
        
        res.json({
            success: true,
            message: 'Admin request submitted for NRSC security approval'
        });

    } catch (error) {
        console.error('NRSC Admin Creation Error:', error);
        res.status(500).json({
            success: false,
            message: 'Secure admin creation failed'
        });
    }
});

module.exports = router;