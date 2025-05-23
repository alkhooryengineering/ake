const express = require('express');
const multer = require('multer');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for GitHub Pages frontend
const allowedOrigins = ['https://alkhooryengineering.github.io'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Set up Multer for file uploads
const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

// Create both email transporters
const primaryTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const secondaryTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER_SECONDARY,
    pass: process.env.EMAIL_PASS_SECONDARY,
  },
});

// Email sending function with failover
const sendWithFailover = async (mailOptions) => {
  try {
    await primaryTransporter.sendMail(mailOptions);
    console.log('Email sent with primary account');
  } catch (error) {
    console.warn('Primary email failed:', error.message);
    console.log('Trying secondary account...');
    try {
      // Use secondary account as sender
      mailOptions.from = mailOptions.from.replace(process.env.EMAIL_USER, process.env.EMAIL_USER_SECONDARY);
      await secondaryTransporter.sendMail(mailOptions);
      console.log('Email sent with secondary account');
    } catch (error2) {
      console.error('Secondary email failed:', error2.message);
      throw new Error('Both email attempts failed.');
    }
  }
};

// POST endpoint to receive the form
app.post('/send-pdf', upload.any(), async (req, res) => {
  try {
    const pdfFile = req.files.find(f => f.originalname.endsWith('.pdf'));
    const imageFiles = req.files.filter(f => f.fieldname.startsWith('photo'));

    const { company, otherCompany } = req.body;
    const displayName = company === 'Other' ? otherCompany : company;

    const attachments = [
      {
        filename: 'order.pdf',
        content: pdfFile.buffer,
      },
      ...imageFiles.map(file => ({
        filename: file.originalname,
        content: file.buffer,
      }))
    ];

    // Extract and filter relevant fields
    const fields = [
      { label: 'Trip Phase', value: req.body.trip_phase === 'start' ? 'Trip Start' : (req.body.trip_phase === 'end' ? 'Trip End' : '') },
      { label: 'Vehicle', value: req.body.vehicle },
      { label: 'Odometer', value: req.body.odometer },
      { label: 'Job Card', value: req.body.Job_Card || 'N/A' },
      { label: 'AKE Department', value: req.body.ake_department || req.body.other_department },
      { label: 'Reason of Trip', value: req.body.reason_of_trip },
      { label: 'Date', value: req.body.date_field },
      { label: 'Driver Name', value: req.body.driver_name }
    ];

    const filledFields = fields.filter(f => f.value && f.value.trim() !== '');

    let htmlContent = '';

    if (filledFields.length > 0) {
      htmlContent = '<p>' + filledFields.map(field => `${field.label}: ${field.value}`).join('<br>') + '</p>';
    }

    const subject = filledFields.length > 0
      ? (req.body.driver_name || 'Driver Name')
      : 'new form submitted';

    const mailOptions = {
      from: `${displayName || 'AKE Vehicle Form'} <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject,
      html: htmlContent,
      attachments,
    };

    await sendWithFailover(mailOptions);
    res.status(200).send('Email sent successfully');

  } catch (error) {
    console.error('Email sending failed:', error);
    res.status(500).send('Email sending failed');
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
