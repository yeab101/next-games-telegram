require("dotenv").config();
const axios = require('axios');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAMBOTTOKEN; 
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

const sendTelegramMessage = async (chatId, message) => {
    try {
        const response = await axios.post(TELEGRAM_API_URL, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

        if (!response.data.ok) {
            throw new Error(`Telegram API error: ${response.data.description}`);
        }

        console.log('Message sent successfully');
        return true;
    } catch (error) {
        if (error.response?.data) {
            console.error('Telegram API error:', error.response.data);
            if (error.response.data.error_code === 400) {
                console.error('Invalid chat ID or message format');
            }
        } else {
            console.error('Error sending Telegram message:', error.message);
        }
        return false;
    }
};


module.exports = {sendTelegramMessage}