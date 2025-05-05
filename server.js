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

dotenv.config();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: '*'
}));

const SECRET_KEY = 'mogu_jwt_main_secret';
const dirname = path.resolve(__dirname, "..");
app.use(bodyParser.json());

const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const companiesFile = path.join(dataDir, 'companies.json');
const templatesFile = path.join(dataDir, 'templates.json');
const reviewsFile = path.join(dataDir, 'reviews.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');
if (!fs.existsSync(companiesFile)) fs.writeFileSync(companiesFile, '[]');
if (!fs.existsSync(templatesFile)) fs.writeFileSync(templatesFile, '[]');
if (!fs.existsSync(reviewsFile)) fs.writeFileSync(reviewsFile, '[]');

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf-8') || '[]');
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

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
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const users = readJSON(usersFile);
  const user = users.find(u => u.email === email);
  if (!user) return res.status(401).json({ message: 'User not found' });

  bcrypt.compare(password, user.password, (err, result) => {
    if (!result) return res.status(401).json({ message: 'Invalid credentails.' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, companyId: user.companyId }, SECRET_KEY);
    res.json({ token });
  });
});

// Create company (system admin only)
app.post('/api/companies', authMiddleware, (req, res) => {
  if (req.user.role !== 'system_admin') return res.sendStatus(403);

  const companies = readJSON(companiesFile);

  const { name, email, address, reviewOptions } = req.body;

  if (!name || !email || !address || !reviewOptions) {
    return res.status(400).json({ message: 'All fields including reviewOptions are required' });
  }

  const newCompany = {
    id: Date.now(),
    name,
    email,
    address,
    reviewOptions, // expects { google, tripAdvisor, facebook, other }
  };

  companies.push(newCompany);
  writeJSON(companiesFile, companies);

  res.status(201).json(newCompany);
});

// Update company (system admin only)
app.put('/api/companies/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'system_admin') return res.sendStatus(403);

  // Parse the id from route params and ensure it’s a number
  const companyId = Number(req.params.id);

  // Load current companies
  const companies = readJSON(companiesFile);

  // Find the index of the company to update
  const idx = companies.findIndex(c => c.id === companyId);
  if (idx === -1) {
    return res.status(404).json({ message: 'Company not found' });
  }

  // Destructure incoming fields
  const { name, email, address, reviewOptions } = req.body;

  // Validate required fields (you can adjust as needed)
  if (!name || !email || !address || !reviewOptions) {
    return res.status(400).json({ message: 'All fields including reviewOptions are required' });
  }

  // Build the updated company object
  const updatedCompany = {
    ...companies[idx],
    name,
    email,
    address,
    reviewOptions,
  };

  // Replace in array and save
  companies[idx] = updatedCompany;
  try {
    writeJSON(companiesFile, companies);
    res.json(updatedCompany);
  } catch (err) {
    console.error('Failed to write companies:', err);
    res.status(500).json({ message: 'Failed to save company' });
  }
});

app.get('/api/my-companies', authMiddleware, (req, res) => {
  const companies = readJSON(companiesFile);
  const user = req.user;

  if (user.role === 'system_admin') {
    // Return all companies
    res.json(companies);
  } else {
    // Return only the company the user belongs to
    const userCompany = companies.find(c => c.id === user.companyId);
    if (userCompany) {
      res.json([userCompany]);
    } else {
      res.status(404).json({ message: "Company not found" });
    }
  }
});


app.get('/api/companies', authMiddleware, (req, res) => {
  const companies = readJSON(companiesFile);
  res.json(companies);
});

// DELETE /api/companies/:id
app.delete('/api/companies/:id', (req, res) => {
  const { id } = req.params;

  const companies = readJSON(companiesFile);
  const index = companies.findIndex(c => c.id === Number(id)); // convert id to number

  if (index === -1) {
    return res.status(404).json({ message: 'Company not found' });
  }

  companies.splice(index, 1);

  try {
    writeJSON(companiesFile, companies);
    res.json({ message: 'Company deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save data' });
  }
});

//Users By Company
app.get('/api/users', authMiddleware, (req, res) => {
  const users = readJSON(usersFile);
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ message: 'companyId is required' });
  }

  const filteredUsers = users.filter(user => user.companyId === companyId);
  res.json(filteredUsers);
});

//Update User profile picture
app.put('/api/profile', authMiddleware, (req, res) => {
  const users = readJSON(usersFile);
  const userId = req.user.id;

  const userIndex = users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }

  const updatedFields = req.body;
  console.log(updatedFields)
  users[userIndex] = {
    ...users[userIndex],
    ...updatedFields,
  };

  writeJSON(usersFile, users);

  res.json({ message: 'Profile updated', user: users[userIndex] });
});

//Fetch User Profile
app.get('/api/profile', authMiddleware, (req, res) => {
  const users = readJSON(usersFile);
  const userId = req.user.id;

  const userProfile = users.find(u => u.id === userId);

  if (!userProfile) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json(userProfile);
});

// Create user
app.post('/api/users', authMiddleware, async (req, res) => {
  const { firstName, lastName, email, phoneNumber, role, status, companyId } = req.body;
  console.log("user creation". email)
  if (!['company_admin', 'general_user'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role type.' });
  }

  const users = readJSON(usersFile);
  if (users.some(u => u.email === email)) {
    return res.status(400).json({ message: 'User already exists.' });
  }

  let profilePic ="";
  const password = generateRandomPassword(); // Implement this function
  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = {
    id: Date.now(),
    firstName,
    lastName,
    email,
    phoneNumber,
    role,
    status: status === 'active',
    password: passwordHash,
    companyId,
    profilePic
  };

  try {
    await sendPasswordEmail(email, password);
  } catch (error) {
    console.error("Email sending failed:", error.message);
    return res.status(400).json({ message: 'Email sending failed' });
  }

  users.push(newUser);
  writeJSON(usersFile, users);
  
  res.status(201).json({ message: 'User created successfully.' });
});

function generateRandomPassword(length = 8) {
  return Math.random().toString(36).slice(-length);
}

//Update User
app.put('/api/users/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, phoneNumber, role, status } = req.body;

  const users = readJSON(usersFile);
  const userIndex = users.findIndex(u => u.id === parseInt(id));

  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found.' });
  }

  // Validate role
  if (role && !['company_admin', 'general_user'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role type.' });
  }

  const user = users[userIndex];
  users[userIndex] = {
    ...user,
    firstName: firstName ?? user.firstName,
    lastName: lastName ?? user.lastName,
    phoneNumber: phoneNumber ?? user.phoneNumber,
    role: role ?? user.role,
    status: typeof status === 'boolean' ? status : user.status
  };

  writeJSON(usersFile, users);
  res.json({ message: 'User updated successfully.' });
});

//Delete User
app.delete('/api/users/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const users = readJSON(usersFile);

  const userIndex = users.findIndex(u => u.id === parseInt(id));

  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found.' });
  }

  users.splice(userIndex, 1);
  writeJSON(usersFile, users);

  res.json({ message: 'User deleted successfully.' });
});


//Forgot Password
app.post('/api/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  const users = readJSON(usersFile);
  const userIndex = users.findIndex(u => u.email === email);

  if (userIndex === -1) {
    // Don't reveal user existence
    return res.status(200).json({ message: 'If your email is registered, your password has been reset.' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  users[userIndex].password = hashedPassword;
  writeJSON(usersFile, users);

  return res.status(200).json({ message: 'Password reset successfully.' });
});

// Get templates (auth required)
app.get('/api/templates', authMiddleware, (req, res) => {
  const templates = readJSON(templatesFile);
  if (req.user.role === 'system_admin') return res.json(templates);
  const filtered = templates.filter(t => t.companyId === req.user.companyId);
  res.json(filtered);
});

// Save template
app.post('/api/templates', authMiddleware, (req, res) => {
  const { templateName, type, requireComment, requireUsername, config, companyId } = req.body;
  console.log(req.body)
  const templates = readJSON(templatesFile);

  const newTemplate = {
    id: Date.now(),
    templateName,
    type,
    requireComment,
    requireUsername,
    config: type === 'Questionnaire' ? config : {},
    companyId
  };

  templates.push(newTemplate);
  writeJSON(templatesFile, templates);
  res.status(201).json(newTemplate);
});

//Get Templates By Id
app.get('/api/templatesById', authMiddleware, (req, res) => {
  const templates = readJSON(templatesFile);
  const template = templates.find((t) => t.id === req.params.id);
  if (!template) return res.status(404).json({ message: 'Template not found' });
  res.json(template);
});

//Get Templates By Company
app.get('/api/templatesByCompany', authMiddleware, (req, res) => {
  const templates = readJSON(templatesFile);
  const companyId = Number(req.query.id);

  const matchedTemplates = templates.filter((t) => t.companyId === companyId);
  
  if (!matchedTemplates.length) {
    return res.status(404).json({ message: 'Template not found' });
  }

  res.json(matchedTemplates);
});

// Save template
app.put('/api/templates', authMiddleware, (req, res) => {
  const templates = readJSON(templatesFile);
  const index = templates.findIndex((t) => t.id === req.body.id);
  if (index === -1) return res.status(404).json({ message: 'Template not found' });

  const updatedTemplate = {
    ...templates[index],
    ...req.body,
    config: req.body.type === 'Questionnaire' ? req.body.config : {},
  };

  templates[index] = updatedTemplate;
  writeJSON(templatesFile, templates);
  res.json(updatedTemplate);
});

// Delete template
app.delete('/api/templates/:key', authMiddleware, (req, res) => {
  let templates = readJSON(templatesFile);
  const templateId = Number(req.params.key);
  console.log(templateId)
  const exists = templates.some((t) => t.id === templateId);
  if (!exists) return res.status(404).json({ message: 'Template not found' });

  templates = templates.filter((t) => t.id !== templateId);
  writeJSON(templatesFile, templates);
  res.json({ message: 'Template deleted successfully' });
});

app.post('/api/postReview', (req, res) => {
  try {
    const { type, data, comment, datetime, companyId } = req.body;

    if (!type || !data) {
      return res.status(400).json({ message: 'userId, type, and data are required' });
    }

    const reviews = readJSON(reviewsFile);
    const userName = `vintageCustomer${Math.floor(1000 + Math.random() * 9000)}`;
    const newReview = {
      id: Date.now(),
      userName,
      type,
      data,
      comment,
      datetime: datetime || new Date().toISOString(),
      companyId
    };

    reviews.push(newReview);
    writeJSON(reviewsFile, reviews);

    res.status(201).json({ message: 'Review saved successfully', review: newReview });
  } catch (err) {
    console.error('Error saving review:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/allReviewsForCompany', (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const reviews = readJSON(reviewsFile);
    const filteredReviews = companyId
      ? reviews.filter((review) => review.companyId === companyId)
      : reviews;

    res.json(filteredReviews);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/dashboardCounts', (req, res) => {
  const companyId = Number(req.query.companyId);

  if (!companyId) {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  const companies = readJSON(companiesFile);
  const users = readJSON(usersFile);
  const templates = readJSON(templatesFile);
  const reviews = readJSON(reviewsFile);

  // Filter data by company ID
  const companyUsers = users.filter(user => user.companyId === companyId);
  const companyTemplates = templates.filter(template => template.companyId === companyId);
  const companyReviews = reviews.filter(review => review.companyId === companyId);

  // Get today's reviews
  const todayReviews = companyReviews.filter(review =>
    dayjs(review.datetime).isSame(dayjs(), 'day')
  );

  // Calculate counts
  const dashboardCounts = {
    totalUsers: companyUsers.length,
    totalTemplates: companyTemplates.length,
    totalReviews: companyReviews.length,
    todayReviews: todayReviews.length,
  };

  res.json(dashboardCounts);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
