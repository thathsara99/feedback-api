const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: String,
  email: String,
  address: String,
  reviewOptions: {
    google: String,
    tripAdvisor: String,
    facebook: String,
    other: String
  }
});

module.exports = mongoose.model('Company', companySchema);
