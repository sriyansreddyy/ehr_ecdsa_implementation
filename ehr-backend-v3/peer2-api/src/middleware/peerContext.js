'use strict';

const gateway = require('../fabric/gatewayManager');

module.exports.peerContext = async (req, res, next) => {
    try {
        if (!req.user?.role) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        req.contract = gateway.getContract(req.user.role);
        next();
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};