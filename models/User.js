const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  firstname: {
    type: String,
  },
  chatId: {
    type: String,
    required: true,
  },
  bonus: {
    type: Number,
    default: 0,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  role: {
    type: Boolean,
    default: 0
  },
  balance: {
    type: Number,
    default: 0,
  },
  banned: {
    type: Boolean,
    default: false
  },
  invitedBy: { type: String, default: null },
  inviteCount: { type: Number, default: 0 },
  withdrawals: {
    count: { type: Number, default: 0 },
    lastWithdrawalDate: { type: Date }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);