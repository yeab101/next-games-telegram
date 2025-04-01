const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({ 
    user_id: {
        type: String,
        required: true,
        index: true
    },
    username: {
        type: String,
        required: true
    }, 
    transaction_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    transaction_type: {
        type: String,
        enum: ['debit', 'credit', 'rollback'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    }, 
    game: {
        type: String,
        default: 'Ludo'
    },
    round_id: {
        type: String,
        required: true,
        index: true
    },  
    rollback: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true  
});

// Indexes for common queries
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ user_id: 1, createdAt: -1 });
transactionSchema.index({ transaction_type: 1, status: 1 });
// Add unique compound index to prevent duplicates
transactionSchema.index({ user_id: 1, round_id: 1 }, { unique: true });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;