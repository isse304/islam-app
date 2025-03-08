const express = require('express');
const router = express.Router();
const { requireAuth } = require('@clerk/clerk-sdk-node');

// Test endpoint that requires authentication
router.get('/auth-test', requireAuth(), (req, res) => {
    try {
        // Get the authenticated user from the request
        const user = req.auth;
        
        res.json({
            status: 'success',
            message: 'Authentication successful',
            user: {
                id: user.userId,
                sessionId: user.sessionId,
                // Add any other user info you want to return
            },
            // Include request headers for debugging
            headers: {
                authorization: req.headers.authorization ? 'present' : 'missing',
                // Add other relevant headers
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            // Include non-sensitive error details
            details: {
                name: error.name,
                type: error.type
            }
        });
    }
});

// Test endpoint that doesn't require authentication
router.get('/public-test', (req, res) => {
    res.json({
        status: 'success',
        message: 'This is a public endpoint',
        timestamp: new Date().toISOString()
    });
});

module.exports = router; 