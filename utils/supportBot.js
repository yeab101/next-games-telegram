require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} - ${level.toUpperCase()} - ${message}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

// Verify environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  logger.error('Missing BOT_TOKEN in environment variables');
  process.exit(1);
}

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Response data
const QUESTIONS = {
  "1": "አንዴት ልጫወት ?",
  "2": "በጨዋታ መሀል ቀጥ ብሎ ከቆመ ?",
  "3": "በጨዋታ መሀል ተጨዋች ጥሎ ከወጣ ?",
  "4": "ገንዘብ አስገብቼ ግን አልገባልኝም ?",
  "5": "ገንዘብ ወደ ቴሌብር ልኬ አልደረሰኝም ?"
};

const RESPONSES = {
  "1": `🎮 ጨዋታ ለመጫወት እነሆ አሰራርዎ:
1. የቴሌብር ቦታ @teleber_games ይክፈሉ
2. የሚፈልጉትን ጨዋታ ይምረጡ
3. "ጨዋታን ጀምር" ብለው ይጫኑ
4. ከ24 ሰዓት በኋላ ተጨማሪ ይጫወታሉ!`,

  "2": `⏸️ በጨዋታ መሃል ቀጥ ብሎ ከቆመ ለ24 ሰዓት ይጠብቁ። ከዚያ በኋላ "ቀጥል" በሚለው ቁልፍ ሊቀጥሉ ይችላሉ።`,

  "3": `🚫 ተጨዋች ጥሎ ከወጣ ለ48 ሰዓት ሙሉ ለሙሉ መጫወት አይችሉም። እባክዎ በትእግስት ይጠብቁ!`,

  "4": `💸 ገንዘብ አስገብተው ካልገባላቸው፦
1. የምክንያቱን ስክሪን ሼር ያድርጉ
2. @teleber_support ይጠይቁ
3. የገንዘብ ዝውውር ማረጋገጫ ያስገቡ
ችግርዎ በ24 ሰዓት ውስጥ ይፈታል!`,

  "5": `📤 ገንዘብ ወደ ቴሌብር ካልደረሰዎት፦
1. የባንክ የደረሰኝ ማረጋገጫ ያስገቡ
2. @teleber_finance ይጠይቁ
3. የገንዘብ መጠን እና ቀን ይጻፉ
ችግርዎ በስልክ ቁጥር +251912345678 ይጠይቁ!`
};

// Command handlers
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  let menu = "❓ እባክዎ ጥያቄዎን ይምረጡ:\n\n";
  Object.entries(QUESTIONS).forEach(([key, text]) => {
    menu += `${key}. ${text}\n`;
  });
  menu += "\nጥያቄዎን ለመምረጥ ቁጥሩን ይጻፉ (1-5)";
  bot.sendMessage(chatId, menu);
});

bot.onText(/\/help/, (msg) => {
  const helpText = `🤖 Available Commands:\n/start - ጨዋታ ለመጀመር\n/help - እገዛ ለማግኘት\n\nጥያቄዎን በቀጥታ መጠየቅም ይችላሉ!`;
  bot.sendMessage(msg.chat.id, helpText);
});

// Handle numeric responses
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const message = msg.text.trim();

  if (/^[1-5]$/.test(message)) {
    bot.sendMessage(chatId, RESPONSES[message]);
    return;
  }

  if (!message.startsWith('/')) {
    bot.sendMessage(chatId, "እባክዎ ከ 1-5 ያለ ቁጥር ይምረጡ ወይም /start ይጫኑ");
  }
});

// Error handling
bot.on('polling_error', (error) => {
  logger.error(`Polling error: ${error.message}`);
});

logger.info('Bot started successfully!'); 