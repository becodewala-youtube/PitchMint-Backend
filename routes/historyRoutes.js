const express = require('express');
const router = express.Router();
const { getActivityHistory } = require('../controllers/historyController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getActivityHistory);

module.exports = router;