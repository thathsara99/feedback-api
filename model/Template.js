const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  templateName: { type: String, required: true },
  type: { type: String, required: true },
  requireComment: { type: Boolean, required: true },
  requireUsername: { type: Boolean, required: true },
  config: { type: Object, default: {} },
  companyId: { type: String, required: true }
});

const Template = mongoose.model('Template', templateSchema);

module.exports = Template;
