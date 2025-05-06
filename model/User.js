const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  phoneNumber: String,
  email: String,
  password: String,
  role: String,
  companyId: String,
  status: Boolean,
  profilePic: String
});

module.exports = mongoose.model('User', userSchema);
