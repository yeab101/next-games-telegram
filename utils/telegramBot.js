require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const User = require("../models/User.js");
const path = require('path');
const Finance = require('../models/financeModel.js');
const SantimpaySdk = require("../lib/index.js"); 

// Constants
const BOT_TOKEN = process.env.TELEGRAMBOTTOKEN;
const BASE_URL = "https://next-games-frontend.vercel.app";
const VALID_PHONE_REGEX = /^09\d{8}$/;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const jwt = require('jsonwebtoken');

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 1 * 60 * 1000; // 5 minutes in milliseconds
const commandCooldowns = new Map();

// Rate limiting utility functions
const isRateLimited = (chatId, command) => {
  const key = `${chatId}:${command}`;
  const lastUsed = commandCooldowns.get(key);
  const now = Date.now();

  if (lastUsed && now - lastUsed < RATE_LIMIT_WINDOW) {
    const timeLeft = Math.ceil((RATE_LIMIT_WINDOW - (now - lastUsed)) / 1000 / 60);
    return timeLeft;
  }

  commandCooldowns.set(key, now);
  return false;
};

const cleanupOldCooldowns = () => {
  const now = Date.now();
  for (const [key, timestamp] of commandCooldowns.entries()) {
    if (now - timestamp > RATE_LIMIT_WINDOW) {
      commandCooldowns.delete(key);
    }
  }
};

// Cleanup old cooldowns every 10 minutes
setInterval(cleanupOldCooldowns, 10 * 60 * 1000);

const GATEWAY_MERCHANT_ID = "27dcd443-1e6f-46d0-8cc3-5918b333dc2b";
const PRIVATE_KEY_IN_PEM = `
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIFamQMQ/56tZuX6sZQBzxxs4EbH9ndELv14JMo6fkfR0oAoGCCqGSM49
AwEHoUQDQgAE09zpUSJToy6M+FWWGQUatRLpUot2314yuBLEZ2XfDhNtEqsqpJ1a
bFpzTyPzIa0JE/MULNEx0rjnia3FntuoiA==
-----END EC PRIVATE KEY-----
`

const notifyUrl = "https://next-games-backend.onrender.com/api/callback/verify-transaction";
const notifyUrlTwo = "https://next-games-backend.onrender.com/api/callback/verify-transaction-two";
const client = new SantimpaySdk(GATEWAY_MERCHANT_ID, PRIVATE_KEY_IN_PEM);
 
const getValidInput = async (bot, chatId, prompt, validator) => {
  while (true) {
    try {
      await bot.sendMessage(chatId, prompt);
      const response = await new Promise((resolve, reject) => {
        const messageHandler = (msg) => {
          if (msg.chat.id === chatId) {
            // Check if message is a command (starts with '/')
            if (msg.text.startsWith('/')) {
              bot.removeListener('message', messageHandler);
              reject(new Error('Command interrupt'));
              return;
            }
            bot.removeListener('message', messageHandler);
            resolve(msg);
          }
        };
        bot.on('message', messageHandler);
        setTimeout(() => {
          bot.removeListener('message', messageHandler);
          reject(new Error('Response timeout'));
        }, 60000);
      });

      if (validator(response.text)) {
        return response.text;
      } else {
        await bot.sendMessage(chatId, "Invalid input. Please try again.");
      }
    } catch (error) {
      if (error.message === 'Command interrupt') {
        // Exit silently if interrupted by a command
        return null;
      }
      console.error('Error getting input:', error);
      await bot.sendMessage(chatId, "Operation cancelled.");
      return null;
    }
  }
};

// Utility functions
const errorHandler = async (operation, chatId, errorMsg = "An error occurred") => {
  try {
    return await operation();
  } catch (error) {
    console.error(`Error: ${errorMsg}:`, error);
    await bot.sendMessage(chatId, errorMsg);
    return null;
  }
};

const validateUserInput = {
  phone: (number) => VALID_PHONE_REGEX.test(number),
  username: (username) => Boolean(username),
};



// Command handlers
const commandHandlers = {
  sendMainMenu: async (chatId) => { 
    await errorHandler(async () => {
      const rulePath = path.join(__dirname, 'menu.jpg');
      const token = jwt.sign(
        { chatId },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      await bot.sendPhoto(chatId, rulePath, {
        caption: "\n\nWelcome to Next Games! Home for the best multiplayer games!",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Play", web_app: { url: `${BASE_URL}/lobby/${chatId}?token=${token}`} },
              { text: "Register 👤", callback_data: "register" }
            ],
            [
              { text: "Deposit 💰", callback_data: "deposit" },
              { text: "Withdraw 💰", callback_data: "withdraw" },
            ],
            [
              { text: "Transactions 📜", callback_data: "transactions" },
              { text: "Balance 💰", callback_data: "balance" }
            ], 
            [
              { text: "Contact Us", url: "https://t.me/Sportsupprort" }, 
            ]
          ]
        }

      });
    }, chatId, "Error sending main menu");
  },

  register: async (chatId) => {
    // Check for existing user first
    const existingUser = await User.findOne({ chatId });
    if (existingUser) {
      // const rulePath = path.join(__dirname, 'rule.jpg');
      await bot.sendPhoto(chatId, rulePath, {
        caption: "ምዝገባ አጠናቀዋል! Open Lobby to play."
      });
      return;
    }

    await bot.sendMessage(chatId, "10 ዲጂት ስልክ ቁጥሮን ያስገቡ (starting with '09xxxxxxxx'):");

    bot.once('message', async (msg) => {
      await errorHandler(async () => {
        const { text: phoneNumber, from: { username } } = msg;

        if (!validateUserInput.phone(phoneNumber)) {
          throw new Error("የተሳሳተ ስልክ ቁጥር ነው ያስገቡት:: ድጋሚ ያስገቡ");
        }

        // New phone number duplicate check
        const existingPhoneUser = await User.findOne({ phoneNumber });
        if (existingPhoneUser) {
          await bot.sendMessage(chatId, "❌ ይህ ስልክ ቁጥር ቀድሞውኑ ተመዝግቧል:: አዲስ ቁጥር ይሞክሩ");
          return;
        }

        if (!username) {
          await bot.sendMessage(chatId, "ውድ ደንበኛችን የTelegram Username የሎትም. ለመመዝገብ Telegram settings ላይ Username በማስገባት ድጋሚ ይሞክሩ");
          return;
        }

        const user = new User({ chatId, phoneNumber, username });
        await user.save(); 

        await bot.sendPhoto(chatId, tut1Path, {
          caption: `${username} ምዝገባ ተሳክቶአል መጫወት ይችላሉ /deposit`
        });

     

      }, chatId, "ምዝገባው አልተሳካም ድጋሚ ይክሩ.");
    });
  },

  checkBalance: async (chatId) => {
    await errorHandler(async () => {
      const user = await User.findOne({ chatId });
      if (!user) {
        throw new Error("ምዝገባው አልተሳካም");
      }
      await bot.sendMessage(chatId, `💰 ያሎት ቀሪ ሂሳብ ${user.balance} ብር ነው`);
    }, chatId, "Error checking balance");
  },

  // Transaction handlers
  deposit: async (chatId, msg) => { 

    try {
      const user = await User.findOne({ chatId });
      if (!user) {
        await bot.sendMessage(chatId, "❌ ብር ለማስገባት መመዝገብ አለብክ /register");
        return;
      }

      await bot.sendMessage(chatId,
        "🏦 CbeBirr እና ሌሎች ባንኮች ለማስገባት Others ይምረጡ (1.5% fee):",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Telebirr", callback_data: "deposit_telebirr_direct" } 
              ]
            ]
          }
        }
      );
    } catch (error) {
      console.error("Deposit Error:", error);
      await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
    }
  },
  withdraw: async (chatId, msg) => {
    // Check rate limit
    const timeLeft = isRateLimited(chatId, 'withdraw');
    if (timeLeft) {
      const username = msg.from.username ? `@${msg.from.username}` : `${msg.from.first_name}`;
      await bot.sendMessage(chatId, `❌ Please wait ${timeLeft} minutes before making another withdrawal request.`);
      await bot.sendMessage(1982046925, `User ${username} (${chatId}) attempted withdraw but needs to wait ${timeLeft} minutes before making another withdrawal request.`);
      return;
    }

    const session = await User.startSession();
    try {
      session.startTransaction();

      const user = await User.findOne({ chatId }).session(session);
      if (!user) {
        await bot.sendMessage(chatId, "❌ Please register first to withdraw funds.");
        return;
      }

      // Add balance check BEFORE game check:
      if (user.balance <= 0) {
        await bot.sendMessage(chatId, "❌ ያሎት ቀሪ ሂሳብ አነስተኛነው ");
        await session.abortTransaction();
        return;
      }

      if (user.banned) {
        await bot.sendMessage(chatId, "Under review @Sportsupprort.");
        return;
      }
      // Balance check for exact amount
      if (user.balance < 30) {
        await bot.sendMessage(chatId, "❌ ያሎት ቀሪ ሂሳብ አነስተኛነው ");
        await session.abortTransaction();
        return;
      } 

      await bot.sendMessage(6090575940, `@${user.username} is trying to withdraw with initial ${user.balance} birr  `);

      const paymentMethod = await new Promise((resolve, reject) => {
        const messageOptions = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Telebirr SantimPay 💳", callback_data: "withdraw_telebirr" }
              ]
            ]
          }
        };

        bot.sendMessage(chatId, "Select withdrawal method:", messageOptions)
          .then(sentMsg => {
            const handler = (callbackQuery) => {
              if (callbackQuery.message.chat.id === chatId &&
                callbackQuery.message.message_id === sentMsg.message_id) {
                bot.removeListener('callback_query', handler);
                resolve(callbackQuery.data.replace('withdraw_', ''));
              }
            };

            bot.on('callback_query', handler);

            // 2-minute timeout
            setTimeout(() => {
              bot.removeListener('callback_query', handler);
              reject(new Error('Payment method selection timeout'));
            }, 120000);
          });
      });

      // 2. Account number collection
      let accountPrompt;
      let validator;

      if (paymentMethod === 'telebirr') {
        accountPrompt = "📱 ለማውጣት ወደፈለጉት የቴሌብር ስልክ  ቁጥር ያስገቡ";
        validator = (text) => /^09\d{8}$/.test(text);
      } else {
        await bot.sendMessage(chatId, "🚧 This withdrawal method is coming soon!");
        await session.abortTransaction();
        return;
      }

      const accountNumber = await getValidInput(bot, chatId, accountPrompt, validator);
      if (!accountNumber) return;

      // NEW FORMATTING LOGIC
      const formattedAccount = accountNumber.replace(/^0/, '+251');

      // 3. Amount collection
      let amount = await getValidInput(
        bot,
        chatId,
        "💰 ለማውጣት የፈለጉትን ብር መጠን ያስገቡ (30 ብር - 1000 ብር):",
        (text) => parseFloat(text) >= 30 && parseFloat(text) <= 3000
      );
      if (!amount) return;

      // Move game check BEFORE balance deduction:
      if (user.balance < parseFloat(amount)) {
        await bot.sendMessage(chatId, "❌ ያሎት ቀሪ ሂሳብ አነስተኛነው ");
        await session.abortTransaction();
        return;
      }

      // Deduct balance FIRST
      user.balance -= parseFloat(amount);

      const id = `LD-${Math.floor(Math.random() * 1000000000).toString()}`;
      
      const transactionNew = new Finance({
        transactionId: id,
        chatId: chatId,
        amount: amount,
        status: "PENDING_APPROVAL",
        type: 'withdrawal',
        paymentMethod: paymentMethod,
        accountNumber: formattedAccount
      });

      // Atomic save of both balance and transaction
      await Promise.all([
        transactionNew.save({ session }),
        user.save({ session })
      ]);
      await session.commitTransaction();

      // NEW CONDITIONAL APPROVAL LOGIC
      if (amount > 2) {
        const adminMessage = `🔄 Withdraw Request from @${user.username || chatId}
💰 Amount: ${amount} Birr
💸 New Balance: ${user.balance} Birr 
📱 Phone: ${formattedAccount}
📄 TXID: ${id}
👤 User ID: ${chatId}
`;

        const approveButton = {
          inline_keyboard: [[
            { text: "Approve ✅", callback_data: `approve_withdraw_${id}` }
          ]]
        };
        // Notify all admin channels
        await bot.sendMessage(1982046925, adminMessage, { reply_markup: approveButton });
        await bot.sendMessage(229044326, adminMessage, { reply_markup: approveButton });
        await bot.sendMessage(6090575940, adminMessage, { reply_markup: approveButton });
        // await bot.sendMessage(7030407078, adminMessage, { reply_markup: approveButton });
        // await bot.sendMessage(923117728, adminMessage, { reply_markup: approveButton });
        // await bot.sendMessage(751686391, adminMessage, { reply_markup: approveButton });
        // await bot.sendMessage(415285189, adminMessage, { reply_markup: approveButton });

        await bot.sendMessage(chatId, "⏳ Withdrawal request sucessfull may take 1 - 5 minutes... please wait...");
      } else { 
        await client.sendToCustomer(
          id,
          amount,
          "withdrawal",
          formattedAccount,
          "Telebirr",
          notifyUrlTwo
        );
        transactionNew.status = "COMPLETED";
        await transactionNew.save();
        await bot.sendMessage(1982046925, `✅ ${amount} birr Withdraw for @${user.username}  ${formattedAccount} successful TXID: ${id}`);
        await bot.sendMessage(229044326, `✅ ${amount} birr Withdraw for @${user.username}  ${formattedAccount} successful TXID: ${id}`);
        await bot.sendMessage(6090575940, `✅ ${amount} birr Withdraw for @${user.username}  ${formattedAccount} successful TXID: ${id}`);
        // await bot.sendMessage(7030407078, `✅ ${amount} birr Withdraw for @${user.username}  ${formattedAccount} successful TXID: ${id}`);
        // await bot.sendMessage(923117728, `✅ ${amount} birr Withdraw for @${user.username}  ${formattedAccount} successful TXID: ${id}`);
        // await bot.sendMessage(751686391, `✅ ${amount} birr Withdraw for @${user.username}  ${formattedAccount} successful TXID: ${id}`);
        // await bot.sendMessage(415285189, `✅ ${amount} birr Withdraw for @${user.username}  ${formattedAccount} Wsuccessful TXID: ${id}`);
      }

    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();
      console.error("Withdrawal Error:", error);
      await bot.sendMessage(chatId, "⚠️ Withdrawal processing error");
    }
  }, 
  deposit_telebirr_direct: async (chatId, msg) => {
     
    try {
      const user = await User.findOne({ chatId });
      if (!user) {
        await bot.sendMessage(chatId, "❌ ዲፖዚት ለማደርግ መጀመሪያ ይመዝገቡ /register");
        return;
      }

      // Collect deposit amount
      const collectAmount = () => new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          bot.removeListener('message', messageHandler);
          reject(new Error('Amount input timeout'));
        }, 120000);

        const messageHandler = async (msg) => {
          if (msg.chat.id === chatId) {
            const amount = parseFloat(msg.text);
            if (isNaN(amount) || amount < 20 || amount > 5000) {
              await bot.sendMessage(chatId, "❌ የሚያስገቡት ብር ከ20 ማነስ ከ 5000 መብለጥ የለበትም: Enter amount:");
              return;
            }

            clearTimeout(timeout);
            bot.removeListener('message', messageHandler);
            resolve(amount);
          }
        };

        bot.on('message', messageHandler);
        await bot.sendMessage(chatId, "💵 ማስገባት የፈለጉትን ብር መጠን ያስገቡ (minimum 20 - 5000 ብር):");
      });

      // Collect phone number
      const collectPhoneNumber = () => new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          bot.removeListener('message', messageHandler);
          reject(new Error('Phone number timeout'));
        }, 120000);

        const messageHandler = async (msg) => {
          if (msg.chat.id === chatId) {
            let phone = msg.text.trim();

            // Remove leading zero and add country code
            if (phone.startsWith('0')) {
              phone = phone.substring(1);
            }
            phone = `+251${phone}`;

            // Validate final format
            if (!/^\+2519\d{8}$/.test(phone)) {
              await bot.sendMessage(chatId,
                "❌ የኢትዮጵያ ስልክ ቁጥር ያስገቡ 09xxxxxxxx "
              );
              return;
            }

            clearTimeout(timeout);
            bot.removeListener('message', messageHandler);
            resolve(phone);
          }
        };

        bot.on('message', messageHandler);
        await bot.sendMessage(chatId,
          "📱 ስልክ ቁጥር ያስገቡ"
        );
      });

      // Execute collection flow
      const amount = await collectAmount();
      const phoneNumber = await collectPhoneNumber();
      const id = Math.floor(Math.random() * 1000000000).toString();

      client.directPayment(id, amount, "Payment for a coffee", notifyUrl, phoneNumber, "Telebirr").then(async response => {
        try {
          await Finance.create({
            transactionId: id,
            chatId: chatId,
            type: 'deposit',
            amount: amount,
            paymentMethod: 'SantimPay',
            status: 'PENDING_APPROVAL',
          })
        } catch (error) {
          console.error("Failed to send payment request:", error);
        }

        setTimeout(() => {
          console.log("\n\n*********************************")
          console.log("checking for transaction...")

          client.checkTransactionStatus(id).then(transaction => {
            console.log("Transaction status response: ", transaction);
          }).catch(error => {
            console.error(error)
          })
        }, 20_000)
      }).catch(error => {
        console.error(error)
      })
    } catch (error) {
      await bot.sendMessage(chatId,
        error.message.includes('timeout')
          ? "⏰ Transaction timed out"
          : "❌ ዲፖዚት ተቋርጦአል ድጋሚ ይሞክሩ  /deposit "
      );
    }
  },

  listTransactions: async (chatId) => {
    await errorHandler(async () => {
      const transactions = await Finance.find({ chatId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      if (transactions.length === 0) {
        await bot.sendMessage(chatId, "📭 No transactions found");
        return;
      }

      const transactionList = transactions.map((t, index) => {
        const formattedDate = new Date(t.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        return `▫️ ${index + 1}. ${t.type.toUpperCase()}
• Amount: ${t.amount} Birr
• TXID: ${t.transactionId} 
• Status: ${t.status.replace(/_/g, ' ')}
• Date: ${formattedDate}`;
      }).join('\n\n');

      await bot.sendMessage(chatId,
        `📋 *Last 10 Transactions*:\n\n\`\`\`\n${transactionList}\n\`\`\``,
        {
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true
        }
      );
    }, chatId, "❌ Error fetching transactions");
  },
 

  approveTransaction: async (chatId, msg) => {
    try {
      const transactionId = msg.text.split(' ')[1];
      if (!transactionId) {
        await bot.sendMessage(chatId, "❌ Missing transaction ID. Usage: /approve TRANSACTION_ID");
        return;
      }

      const transaction = await Finance.findOne({ transactionId });
      if (!transaction || transaction.status !== "PENDING_APPROVAL") {
        await bot.sendMessage(chatId, "❌ Invalid or already processed transaction");
        return;
      }

      const user = await User.findOne({ chatId: transaction.chatId });
      const adminMessage = `🔄 Manual Approval Request from Admin:
💰 Amount: ${transaction.amount} Birr
📱 Account: ${transaction.accountNumber}
📄 TXID: ${transactionId}`;

      const approveButton = {
        inline_keyboard: [[
          { text: "Approve ✅", callback_data: `approve_withdraw_${transactionId}` }
        ]]
      };

      // Resend to all admin channels
      await bot.sendMessage(1982046925, adminMessage, { reply_markup: approveButton });
      await bot.sendMessage(229044326, adminMessage, { reply_markup: approveButton });
      await bot.sendMessage(6090575940, adminMessage, { reply_markup: approveButton });
      // await bot.sendMessage(7030407078, adminMessage, { reply_markup: approveButton });
      // await bot.sendMessage(923117728, adminMessage, { reply_markup: approveButton });
      // await bot.sendMessage(751686391, adminMessage, { reply_markup: approveButton });
      // await bot.sendMessage(415285189, adminMessage, { reply_markup: approveButton });

      await bot.sendMessage(chatId, "✅ Approval request resent to admins");

    } catch (error) {
      console.error("Approval Error:", error);
      await bot.sendMessage(chatId, "⚠️ Error processing approval request");
    }
  }
};

const commandMappings = {
  '/register': 'register',
  '/balance': 'checkBalance',
  '/deposit': 'deposit',
  '/withdraw': 'withdraw',
  '/transactions': 'listTransactions', 
  '/approvee': 'approveTransaction'
};

const callbackActions = {
  register: commandHandlers.register,
  balance: commandHandlers.checkBalance,
  deposit: (chatId, query) => commandHandlers.deposit(chatId, query.message),
  withdraw: (chatId, query) => commandHandlers.withdraw(chatId, query.message), 
  deposit_telebirr_direct: (chatId, query) => commandHandlers.deposit_telebirr_direct(chatId, query.message),
  transactions: commandHandlers.listTransactions, 
  approve_withdraw: async (chatId, data) => {
    const transactionId = data.split('_')[2];
    const session = await User.startSession();

    try {
      session.startTransaction();
      const transaction = await Finance.findOne({ transactionId }).session(session);
      const user = await User.findOne({ chatId: transaction.chatId }).session(session);

      if (transaction.status !== 'PENDING_APPROVAL') {
        throw new Error('Transaction already processed');
      }

      // Process payment first
      await client.sendToCustomer(
        transactionId,
        transaction.amount,
        "withdrawal",
        transaction.accountNumber,
        "Telebirr",
        notifyUrlTwo
      );

      // Update transaction status within transaction
      transaction.status = 'COMPLETED';
      await transaction.save({ session });

      // Commit the transaction after all database operations
      await session.commitTransaction();

      // Send notifications after successful commit
      await bot.sendMessage(transaction.chatId, `💵 ${transaction.amount} birr Withdraw successful TXID: ${transaction.transactionId}`);
      
      // Get final balance after transaction is committed
      const finalBalance = await User.findById(user._id).select('balance');
      
      // Send admin notifications
      const adminMessage = `✅ Withdraw ${transaction?.amount} for ${user.username} - ${transactionId} completed\nRemaining Balance: ${finalBalance.balance} Birr`;
      const adminIds = [1982046925, 923117728, 415285189, 751686391, 229044326, 6090575940];
      
      await Promise.all(
        adminIds.map(adminId => bot.sendMessage(adminId, adminMessage))
      );

    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      console.error("Approval Error:", error);
      await bot.sendMessage(1982046925, `❌ Approval failed: ${error.message}`);
      await bot.sendMessage(chatId, "⚠️ Withdrawal approval failed");
    } finally {
      session.endSession();
    }
  },
  withdraw_telebirr: (chatId, query) => commandHandlers.withdraw(chatId, query.message),
};

// Register command handlers
Object.entries(commandMappings).forEach(([command, handler]) => {
  bot.onText(new RegExp(command), (msg) => commandHandlers[handler](msg.chat.id, msg));
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
  const { data } = callbackQuery;
  if (data.startsWith('approve_withdraw_')) {
    return callbackActions.approve_withdraw(callbackQuery.message.chat.id, data);
  }
  const handler = callbackActions[data];
  if (handler) {
    await handler(callbackQuery.message.chat.id, callbackQuery);
  } else {
    console.log(`Unhandled callback data: ${data}`);
  }
});

// Modify the start command to handle referrals and registration
bot.onText(/\/start(.+)?/, async (msg, match) => {
  const chatId = msg.chat.id;

  try {
    // Check if user exists
    const user = await User.findOne({ chatId });

    if (!user) {
      // Get phone number
      const phoneNumber = await getValidInput(
        bot,
        chatId,
        "📱 Welcome! እባክዎ ስልክ ቁትሮን ያስገቡ (format: 09XXXXXXXX):",
        (text) => VALID_PHONE_REGEX.test(text)
      );

      if (!phoneNumber) return;

      // Check if user has Telegram username
      if (!msg.from.username) {
        await bot.sendMessage(
          chatId,
          "❌ የ username የሎትም:: ቴልግራም Setting ላይ username ያስገቡና ድጋሚ ይሞክሩ "

        );
        return;
      }

      // Create new user with referral if exists
      const userData = {
        chatId,
        phoneNumber,
        username: msg.from.username,
        balance: 0
      };
      // Save new user
      const newUser = new User(userData);
      await newUser.save();
      // Welcome message


    } 
    await commandHandlers.sendMainMenu(chatId);


  } catch (error) {
    console.error("Start Error:", error);
    await bot.sendMessage(
      chatId,
      "❌ Registration failed. Please try again with /start"
    );
  }
});

// Update command registration to handle parameters
bot.onText(/\/approvee (.+)/, (msg, match) => {
  commandHandlers.approveTransaction(msg.chat.id, msg);
});

// To disable deprecation warnings, add this at the top of your file:
process.env.MONGOOSE_DISABLE_DEPRECATION_WARNINGS = 'true';

module.exports = bot; 