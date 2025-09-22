require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cron = require('node-cron');

const app = express();
app.use(express.json());

// Railway automatically sets PORT
const PORT = process.env.PORT || 3000;

// Configuration from Railway environment variables
const config = {
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN,
  verifyToken: process.env.VERIFY_TOKEN,
  appSecret: process.env.APP_SECRET,
  instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID
};

// Health check endpoint (useful for Railway monitoring)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'Instagram DM Bot'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Instagram DM Bot is running on Railway! 🚂',
    endpoints: {
      health: '/health',
      webhook: '/webhook'
    }
  });
});

// Webhook verification (Meta requirement)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Webhook verification attempt:', { mode, token });

  if (mode === 'subscribe' && token === config.verifyToken) {
    console.log('✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// Handle webhook events
app.post('/webhook', (req, res) => {
  const body = req.body;

  // Verify request signature
  if (!verifySignature(req, body)) {
    console.log('❌ Invalid webhook signature');
    return res.sendStatus(403);
  }

  console.log('📨 Webhook event received:', JSON.stringify(body, null, 2));

  if (body.object === 'instagram') {
    body.entry?.forEach(entry => {
      // Handle comments
      entry.changes?.forEach(change => {
        if (change.field === 'comments') {
          handleCommentEvent(change.value);
        }
        if (change.field === 'mentions') {
          handleMentionEvent(change.value);
        }
      });

      // Handle direct messages
      entry.messaging?.forEach(event => {
        if (event.message) {
          handleMessage(event);
        }
      });
    });
  }

  res.status(200).send('EVENT_RECEIVED');
});

// Your automation functions (from previous code)
async function handleCommentEvent(commentData) {
  console.log('💬 New comment:', commentData);
  
  try {
    const { id: commentId, text: commentText, from } = commentData;
    const userId = from.id;
    
    if (shouldTriggerDM(commentText)) {
      console.log('🎯 Comment triggers DM automation');
      await initiateDMFromComment(userId, commentText);
      await replyToComment(commentId, "Thanks for your comment! Check your DMs 📩");
    }
  } catch (error) {
    console.error('❌ Error handling comment:', error.message);
  }
}

function shouldTriggerDM(commentText) {
  const triggers = [
    'dm me', 'send info', 'more details', 'interested',
    'price', 'how much', 'info please', 'tell me more'
  ];
  
  return triggers.some(trigger => 
    commentText.toLowerCase().includes(trigger)
  );
}

async function initiateDMFromComment(userId, commentText) {
  try {
    const message = generateDMResponse(commentText);
    await sendDirectMessage(userId, message);
    console.log('✅ DM sent successfully to:', userId);
  } catch (error) {
    console.error('❌ Failed to send DM:', error.response?.data || error.message);
  }
}

function generateDMResponse(commentText) {
  const text = commentText.toLowerCase();
  
  if (text.includes('price')) {
    return `Hi! 👋 I saw you asked about pricing. Here are our options:
    
🔥 Basic: $29/month
⭐ Pro: $59/month  
💎 Enterprise: $99/month

Which one interests you?`;
  }
  
  return `Hi! 👋 Thanks for your comment! I'd love to help you out. What can I assist you with?`;
}

async function sendDirectMessage(recipientId, message) {
  const url = 'https://graph.facebook.com/v18.0/me/messages';
  
  const response = await axios.post(url, {
    recipient: { id: recipientId },
    message: { text: message },
    access_token: config.pageAccessToken
  });
  
  return response.data;
}

async function replyToComment(commentId, replyText) {
  try {
    const url = `https://graph.facebook.com/v18.0/${commentId}/replies`;
    
    await axios.post(url, {
      message: replyText,
      access_token: config.pageAccessToken
    });
    
    console.log('✅ Comment reply sent');
  } catch (error) {
    console.error('❌ Error replying to comment:', error.response?.data);
  }
}

async function handleMessage(event) {
  const { sender, message } = event;
  console.log(`💌 DM from ${sender.id}: ${message.text}`);
  
  const response = generateAutoResponse(message.text);
  await sendDirectMessage(sender.id, response);
}

function generateAutoResponse(messageText) {
  const text = messageText.toLowerCase();
  
  if (text.includes('hello') || text.includes('hi')) {
    return "Hey there! 👋 How can I help you today?";
  }
  
  return "Thanks for your message! I'm here to help. What can I do for you?";
}

function verifySignature(req, body) {
  const signature = req.get('X-Hub-Signature-256');
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', config.appSecret)
    .update(JSON.stringify(body))
    .digest('hex');

  return signature === `sha256=${expectedSignature}`;
}

// Optional: Periodic tasks (Railway handles this well)
cron.schedule('0 */6 * * *', () => {
  console.log('🔄 Running periodic maintenance...');
  // Add any periodic tasks here
});

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚂 Instagram DM Bot running on Railway!`);
  console.log(`📡 Server listening on port ${PORT}`);
  console.log(`🌐 Health check: /health`);
  console.log(`📨 Webhook endpoint: /webhook`);
  
  // Log configuration status
  console.log('⚙️  Configuration check:');
  console.log('- Page Access Token:', config.pageAccessToken ? '✅ Set' : '❌ Missing');
  console.log('- Verify Token:', config.verifyToken ? '✅ Set' : '❌ Missing');
  console.log('- App Secret:', config.appSecret ? '✅ Set' : '❌ Missing');
  console.log('- Instagram Account ID:', config.instagramAccountId ? '✅ Set' : '❌ Missing');
});

module.exports = app;
