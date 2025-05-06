const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cors = require("cors");
const app = express();
const dayjs = require('dayjs');
const dotenv = require("dotenv");
const mongoose = require('mongoose');
const User = require('./model/User');
const Company = require('./model/Company');
const Template = require('./model/Template');
const Review = require("./model/Review");

dotenv.config();
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("MongoDB connection error:", err));

app.use(cors({
    origin: '*'
}));

const SECRET_KEY = 'mogu_jwt_main_secret';
const dirname = path.resolve(__dirname, "..");
app.use(bodyParser.json());

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tcroos365@gmail.com',
    pass: 'agqf nvat hsbh kynl'
  }
});

const sendPasswordEmail = async (email, password) => {
  try {
    await transporter.sendMail({
      from: 'tcroos365@gmail.com',
      to: email,
      subject: 'Your Account Credentials',
      text: `Your login password: ${password}`
    });
    console.log("Email sent to:", email);
  } catch (error) {
    console.error("Failed to send email:", error.message);
  }
};


const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (e) {
    res.sendStatus(403);
  }
};

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(401).json({ message: 'User not found' });

  if (user.status === false) {
    return res.status(403).json({ message: 'User account is inactive. Please contact admin.' });
  }

  const match = bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ message: 'Invalid credentials.' });

  const token = jwt.sign({ id: user._id, email: user.email, role: user.role, companyId: user.companyId }, SECRET_KEY);
  res.json({ token });
});

// Create company (system admin only)
app.post('/api/companies', authMiddleware, async (req, res) => {
  if (req.user.role !== 'system_admin') return res.sendStatus(403);

  const { name, email, address, reviewOptions } = req.body;

  if (!name || !email || !address || !reviewOptions) {
    return res.status(400).json({ message: 'All fields including reviewOptions are required' });
  }

  const newCompany = new Company({
    name,
    email,
    address,
    reviewOptions
  });

  await newCompany.save();
  res.status(201).json(newCompany);
});

// Update company (system admin only)
app.put('/api/companies/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'system_admin') return res.sendStatus(403);

  const companyId = req.params.id;
  const { name, email, address, reviewOptions } = req.body;

  if (!name || !email || !address || !reviewOptions) {
    return res.status(400).json({ message: 'All fields including reviewOptions are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return res.status(400).json({ message: 'Invalid company ID' });
  }

  try {
    const company = await Company.findByIdAndUpdate(
      companyId,
      { name, email, address, reviewOptions },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    res.json(company);
  } catch (error) {
    console.error('Error updating company:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/my-companies', authMiddleware, async (req, res) => {
  const user = req.user;
  if (user.role === 'system_admin') {
    const companies = await Company.find();
    return res.json(companies);
  }

  const company = await Company.findOne({ id: user.companyId });
  if (company) return res.json([company]);

  res.status(404).json({ message: 'Company not found' });
});

app.get('/api/companies', authMiddleware, async (req, res) => {
  const companies = await Company.find();
  res.json(companies);
});

// DELETE /api/companies/:id
app.delete('/api/companies/:id', authMiddleware, async (req, res) => {
  const companyId = req.params.id;
  const result = await Company.deleteOne({ _id: companyId });

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: 'Company not found' });
  }

  res.json({ message: 'Company deleted successfully' });
});


//Users By Company
app.get('/api/users', authMiddleware, async (req, res) => {
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ message: 'companyId is required' });
  }

  try {
    const users = await User.find({
      companyId: new mongoose.Types.ObjectId(companyId)
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


//Update User profile picture
app.put('/api/profile', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      req.body,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Profile updated', user: updatedUser });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


//Fetch User Profile
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// Create user
app.post('/api/users', authMiddleware, async (req, res) => {
  const { firstName, lastName, email, phoneNumber, role, status, companyId } = req.body;

  if (!['company_admin', 'general_user'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role type.' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    const password = generateRandomPassword();
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      email,
      phoneNumber,
      role,
      status: status === 'active',
      companyId,
      profilePic: '',
      password: passwordHash
    });

    await sendPasswordEmail(email, password);
    await newUser.save();

    res.status(201).json({ message: 'User created successfully.' });
  } catch (error) {
    console.error("Email sending failed:", error.message);
    res.status(400).json({ message: 'Email sending failed' });
  }
});


function generateRandomPassword(length = 8) {
  return Math.random().toString(36).slice(-length);
}

//Update User
app.put('/api/users/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, phoneNumber, role, status } = req.body;
  if (role && !['company_admin', 'general_user'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role type.' });
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(phoneNumber && { phoneNumber }),
          ...(role && { role }),
          ...(typeof status === 'boolean' && { status })
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: 'User updated successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


//Delete User
app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});



//Forgot Password
app.post('/api/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ message: 'If your email is registered, your password has been reset.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: 'Password reset successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// Get templates (auth required)
app.get('/api/templates', authMiddleware, async (req, res) => {
  try {
    let templates = await Template.find();
    if (req.user.role !== 'system_admin') {
      templates = templates.filter(t => t.companyId === req.user.companyId);
    }
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching templates', error: error.message });
  }
});


// Save template
app.post('/api/templates', authMiddleware, async (req, res) => {
  const { templateName, type, requireComment, requireUsername, config, companyId } = req.body;

  try {
    const newTemplate = new Template({
      templateName,
      type,
      requireComment,
      requireUsername,
      config: type === 'Questionnaire' ? config : {},
      companyId
    });

    await newTemplate.save();
    res.status(201).json(newTemplate);
  } catch (error) {
    res.status(500).json({ message: 'Error saving template', error: error.message });
  }
});


// Get template by ID
app.get('/api/templatesById/:id', authMiddleware, async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching template', error: error.message });
  }
});


// Get templates by company
app.get('/api/templatesByCompany', authMiddleware, async (req, res) => {
  const companyId = req.query.id;

  try {
    const matchedTemplates = await Template.find({ companyId });
    if (!matchedTemplates.length) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.json(matchedTemplates);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching templates', error: error.message });
  }
});


// Update template
app.put('/api/templates', authMiddleware, async (req, res) => {
  const { id, templateName, type, requireComment, requireUsername, config, companyId } = req.body;

  try {
    const template = await Template.findById(id);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    template.templateName = templateName ?? template.templateName;
    template.type = type ?? template.type;
    template.requireComment = requireComment ?? template.requireComment;
    template.requireUsername = requireUsername ?? template.requireUsername;
    template.config = type === 'Questionnaire' ? config : template.config;
    template.companyId = companyId ?? template.companyId;

    await template.save();
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Error updating template', error: error.message });
  }
});


// Delete template
app.delete('/api/templates/:id', authMiddleware, async (req, res) => {
  try {
    const template = await Template.findByIdAndDelete(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting template', error: error.message });
  }
});


app.post('/api/postReview', async (req, res) => {
  try {
    const { type, data, comment, datetime, companyId } = req.body;

    if (!type || !data) {
      return res.status(400).json({ message: 'Type and data are required' });
    }

    const userName = `vintageCustomer${Math.floor(1000 + Math.random() * 9000)}`;

    const newReview = new Review({
      userName,
      type,
      data,
      comment,
      datetime: datetime || new Date().toISOString(),
      companyId
    });

    await newReview.save();

    res.status(201).json({ message: 'Review saved successfully', review: newReview });
  } catch (err) {
    console.error('Error saving review:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


app.get('/allReviewsForCompany', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    console.log(companyId)
    const reviews = await Review.find({ companyId });

    res.json(reviews);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


app.get('/api/dashboardCounts', async (req, res) => {
  try {
    const companyId = req.query.companyId;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    // Get today's date range (00:00 to 23:59)
    const startOfDay = dayjs().startOf('day').toDate();
    const endOfDay = dayjs().endOf('day').toDate();

    // Query counts in parallel
    const [totalUsers, totalTemplates, totalReviews, todayReviews] = await Promise.all([
      User.countDocuments({ companyId }),
      Template.countDocuments({ companyId }),
      Review.countDocuments({ companyId }),
      Review.countDocuments({ 
        companyId,
        datetime: { $gte: startOfDay, $lte: endOfDay }
      })
    ]);

    const dashboardCounts = {
      totalUsers,
      totalTemplates,
      totalReviews,
      todayReviews,
    };

    res.json(dashboardCounts);
  } catch (err) {
    console.error('Error fetching dashboard counts:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
