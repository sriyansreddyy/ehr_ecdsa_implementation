'use strict';

const router = require('express').Router();
const multer = require('multer');
const Tesseract = require('tesseract.js');
const { authenticate } = require('../middleware/auth');
const { fabricContext } = require('../middleware/fabricContext');
const { uploadFile } = require('../fabric/ipfsClient');
const { wrap } = require('../middleware/errorHandler');
const logger = require('../config/logger');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Helper: Extract medical attributes from raw OCR text using regex
 */
function extractAttributes(text) {
  const attributes = {
    patientName: '',
    date: '',
    hospital: '',
    diagnosis: '',
    treatment: '',
    doctor: ''
  };

  // Basic regex patterns for extraction
  const patterns = {
    patientName: /(?:Name|Patient Name|Patient)\s*:\s*([^\n\r]+)/i,
    date: /(?:Date|Report Date)\s*:\s*([^\n\r]+)/i,
    hospital: /(?:Hospital|Clinic|Medical Center)\s*:\s*([^\n\r]+)/i,
    diagnosis: /(?:Diagnosis|Findings|Impression)\s*:\s*([^\n\r]+)/i,
    treatment: /(?:Treatment|Medication|Prescription)\s*:\s*([^\n\r]+)/i,
    doctor: /(?:Doctor|Dr\.|Physician)\s*:\s*([^\n\r]+)/i
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match && match[1]) {
      attributes[key] = match[1].trim();
    }
  }

  // Fallback for date if specific "Date:" label is not found
  if (!attributes.date) {
    const genericDatePattern = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i;
    const dateMatch = text.match(genericDatePattern);
    if (dateMatch) attributes.date = dateMatch[1];
  }

  return attributes;
}

/**
 * POST /ocr
 * 1. Receive image file
 * 2. Upload to IPFS for archival
 * 3. Run OCR via Tesseract.js
 * 4. Extract structured attributes
 * 5. Return extracted text, attributes, and source CID
 */
router.post('/',
  authenticate,
  fabricContext,
  upload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'File is required' });
    }

    try {
      logger.info('OCR Request received', { 
        patientId: req.patient.username, 
        filename: req.file.originalname,
        size: req.file.size
      });

      // Step 1: Upload to IPFS
      const { cid } = await uploadFile(req.file.buffer, req.file.originalname);
      logger.info('OCR source pinned to IPFS', { cid });

      // Step 2: Run OCR
      const { data: { text } } = await Tesseract.recognize(
        req.file.buffer,
        'eng',
        { logger: m => logger.debug('Tesseract:', m) }
      );

      logger.info('OCR processing complete', { textLength: text.length });

      // Step 3: Extract structured attributes
      const attributes = extractAttributes(text);

      return res.json({
        success: true,
        data: {
          text: text.trim(),
          attributes,
          sourceCid: cid,
          filename: req.file.originalname
        }
      });
    } catch (error) {
      logger.error('OCR Processing failed', { error: error.message });
      return res.status(500).json({ success: false, error: 'OCR Processing failed: ' + error.message });
    }
  })
);

module.exports = router;
