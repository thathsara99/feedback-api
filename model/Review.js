const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  type: { type: String, required: true },
  data: { type: Object, required: true },  // can store any type of data depending on the review type
  comment: { type: String },
  datetime: { type: Date, required: true },
  companyId: { type: String, required: true }
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
