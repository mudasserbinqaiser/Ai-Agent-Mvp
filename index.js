import express from 'express';
import https from 'https';
import twilio from 'twilio';
import 'dotenv/config'

const app = express();
const port = 3000;

// Add middleware to parse incoming POST data
app.use(express.urlencoded({ extended: true }));

// Configuration
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY
const ULTRAVOX_API_URL = 'https://api.ultravox.ai/api/calls';

// Ultravox configuration
const SYSTEM_PROMPT = `Your name is Steve and you're answering calls on behalf of Knolabs AI Agency, a UK-based company specializing in AI Automation and Web Development services.

Greet the caller warmly and introduce yourself as a representative of Knolabs AI Agency. Ask how you can assist them today.

If they inquire about services, explain that Knolabs specializes in:
- AI Automation solutions (including Voice AI)
- Web Development services
- Multimodal AI use cases
- Customized business automation solutions

If asked about pricing, explain that Knolabs AI Agency operates both as a Pure AI Automation Agency and a Web Development Agency. After understanding their requirements, you'll pass the details to the relevant team, and a team member will reach out within 24 hours with a detailed timeline and quotation tailored to their specific needs.

Focus on:
- Understanding their business needs
- Gathering specific requirements
- Being professional and helpful
- Explaining Knolabs' expertise in delivering effective business solutions

Remember to collect their contact details for follow-up if they show interest.`;

const ULTRAVOX_CALL_CONFIG = {
    systemPrompt: SYSTEM_PROMPT,
    model: 'fixie-ai/ultravox',
    voice: 'Mark',
    temperature: 0.3,
    firstSpeaker: 'FIRST_SPEAKER_AGENT',
    medium: { "twilio": {} }
};

// Create Ultravox call and get join URL
async function createUltravoxCall(config = ULTRAVOX_CALL_CONFIG) {
    const request = https.request(ULTRAVOX_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ULTRAVOX_API_KEY
        }
    });

    return new Promise((resolve, reject) => {
        let data = '';

        request.on('response', (response) => {
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(JSON.parse(data)));
        });

        request.on('error', reject);
        request.write(JSON.stringify(config));
        request.end();
    });
}

// Handle incoming calls
app.post('/incoming', async (req, res) => {
    try {
        // Get caller's phone number
        const callerNumber = req.body.From;
        console.log(`Incoming call from: ${callerNumber}`);

        // Create dynamic system prompt with caller's number
        const dynamicSystemPrompt = `Your name is Steve and you're answering calls on behalf of Knolabs AI Agency, a UK-based company specializing in AI Automation and Web Development services.

Greet the caller warmly and introduce yourself as a representative of Knolabs AI Agency. Ask how you can assist them today.

IMPORTANT CONTEXT:
- The caller's phone number is: ${callerNumber}
- You already have this number, so if they request a callback or follow-up, you can say "I can see you're calling from ${callerNumber}, shall I use this number for the follow-up? Get a confirmation always before moving forward. Don't assume it's their number!"

If they inquire about services, explain that Knolabs specializes in:
- AI Automation solutions (including Voice AI)
- Web Development services
- Multimodal AI use cases
- Customized business automation solutions

If asked about pricing, explain that Knolabs AI Agency operates both as a Pure AI Automation Agency and a Web Development Agency. After understanding their requirements, you'll pass the details to the relevant team, and a team member will reach out within 24 hours with a detailed timeline and quotation tailored to their specific needs.

Focus on:
- Understanding their business needs
- Gathering specific requirements
- Being professional and helpful
- Explaining Knolabs' expertise in delivering effective business solutions

Remember: You already have their contact number (${callerNumber}), so you can focus on gathering other relevant information for the follow-up.`;

        // Create an Ultravox call with dynamic prompt
        const callConfig = {
            ...ULTRAVOX_CALL_CONFIG,
            systemPrompt: dynamicSystemPrompt
        };

        // Create Ultravox call with updated config
        const { joinUrl } = await createUltravoxCall(callConfig);

        const twiml = new twilio.twiml.VoiceResponse();
        const connect = twiml.connect();
        connect.stream({
            url: joinUrl,
            name: 'ultravox'
        });

        const twimlString = twiml.toString();
        res.type('text/xml');
        res.send(twimlString);

    } catch (error) {
        console.error('Error handling incoming call:', error);
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Sorry, there was an error connecting your call.');
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});