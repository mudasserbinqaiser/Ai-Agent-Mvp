import express from 'express';
import https from 'https';
import twilio from 'twilio';
import 'dotenv/config';
import xlsx from 'xlsx';
import fs from 'fs';

const app = express();
const port = process.env.PORT;

// Add middleware to parse incoming POST data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY
const ULTRAVOX_API_URL = 'https://api.ultravox.ai/api/calls';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_NUMBER;

// Twilio Client
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Load Excel Directory
const DRIVERS_DIRECTORY_PATH = './South_Carolina_Directory.xlsx';
let driverData = {};

// ** Function to Load Excel Data**
function loadDriverDirectory() {
    if (!fs.existsSync(DRIVERS_DIRECTORY_PATH)) {
        console.error("🚨 Driver directory not found!");
        return;
    }

    const workbook = xlsx.readFile(DRIVERS_DIRECTORY_PATH);
    const sheetName = workbook.SheetNames[1];
    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    driverData = {};  // Reset

    sheet.forEach(row => {
        if (row["Phone Number"]) {  // Ensure phone number is present
            driverData[row["Phone Number"]] = {
                name: row["Name"] || "Driver",
                dbaName: row["DBA Name"] || "",
                usdot: row["USDOT"] || "Unknown",
                address: row["Address"] || "No address provided",
                phone: row["Phone Number"],
                fax: row["Fax"] || "N/A",
                email: row["Email"] || "No email provided",
                operationType: row["Carrier Operation Type"] || "Unknown",
                drivers: row["Drivers"] || "Unknown",
                equipment: row["Equipment"] || "Unknown"
            };
        }
    });

    console.log("✅ Driver directory loaded successfully!");
}

// Load driver data at startup
loadDriverDirectory();

// **🔹 Function to Get Driver Info by Phone Number**
function getDriverInfo(phoneNumber) {
    return driverData[phoneNumber] || null;
}

function generateDynamicPrompt(driverInfo) {
    return `
    Truck Onboarding Call Agent Script
    Objective: Onboard truck drivers to the company by understanding their needs, discussing services, and setting them up for dispatch.

    1. Greeting & Introduction
    "Hello, good [morning/afternoon/evening], this is George from Odispatch Solutions. How are you doing today?"

    ${driverInfo ? `I see that you're operating under USDOT **${driverInfo.usdot}**, and your company name is **${driverInfo.dbaName || driverInfo.name}**.` : ''}

    ${driverInfo?.address ? `I see your business is located in **${driverInfo.address}**. Do you primarily haul within your state or across multiple states?` : ''}

    2. Identifying the Truck Type
    "Before we proceed, I’d like to understand a bit more about your truck. 
    ${driverInfo?.equipment ? `I see that you operate a **${driverInfo.equipment}**. Can you confirm that?` : 'Could you tell me what type of truck you have?'}"

    ${driverInfo?.equipment ? '' : `Dry Van? (48ft/53ft)
    Reefer? (48ft/53ft)
    Flatbed? (48ft/53ft) – Do you have tools like tarps, straps, chains, binders, winch, or a ramp?
    Hotshot? (26ft/30ft/36ft/40ft) – Do you have tools like tarps, straps, chains, binders, winch, or a ramp?
    Box-truck? (26ft) – Do you have a lift gate, pallet jack, straps, or E-tracks?
    Power-only?`}

    ${driverInfo?.operationType ? `I see that you operate as a **${driverInfo.operationType}** carrier. Do you usually work locally (inside the state) or OTR (On The Road)?` : 'Do you usually work locally (inside the state) or OTR (On The Road)?'}

    ${driverInfo?.email ? `I see you’ve used the email **${driverInfo.email}**. Can I send your sign-up link there?` : 'Can you provide your email for registration?'}

    3. Dispatcher Inquiry
    "Have you worked with a dispatcher before?"
    
    ${driverInfo?.dispatcher ? `I see that you've worked with a dispatcher before. Were you satisfied with their service?` : `"We offer a comprehensive dispatch service that ensures you get access to high-paying loads, and we handle all the paperwork, negotiations, and compliance for you."`}

    4. Rates & Service Benefits
    "Our rates depend on the size of your truck, but the best part is:"

    ✅ No contract obligation – You can stop working with us anytime.
    ✅ No Load, No Fee – If you don’t book a load, we don’t charge you.
    ✅ You approve every load – No loads will be booked without your consent.
    ✅ We handle all paperwork, including:
       - Carrier setup
       - TONU (Truck Order Not Used)
       - Detention management
       - IFTA filing
       - DOT compliance
       - Invoicing

    ✅ Dedicated Dispatchers – Experienced professionals will negotiate and book high-paying loads for you.
    ✅ We only charge 7% of the load.

    "Would you be interested in signing up with us?"

    5. Setting Up the Driver
    "Signing up is easy! I will send you a signup link via text and email."

    ${driverInfo?.email ? `I have your email as **${driverInfo.email}**. Can I send the signup link there?` : "Can you confirm your email address so we can send you the signup link?"}

    📩 Once you receive the email, please reply with the following documents:
    1️⃣ MC Certificate
    2️⃣ W9 Form
    3️⃣ Certificate of Insurance (COI)
    4️⃣ Notice of Assignment (if factoring)
    5️⃣ Driver’s License
    6️⃣ Cab Card Registration

    "After you send these documents, we will finalize your setup, and you’ll be ready to receive loads."

    6. Handling Load Requests (If the Driver Asks for a Load Immediately)
    "Absolutely! Let me check for loads in your area. 
    ${driverInfo?.address ? `I see that you’re located in **${driverInfo.address}**. What’s your current ZIP code?` : 'What’s your current ZIP code?'}"

    📌 Example Load:
    - Deadhead Miles: **[Random between 50-150 miles]**
    - Total Distance: **[Random between 300-1500 miles]**
    - Load Weight: **[Random between 20,000 - 45,000 lbs]**
    - Rate: **[$2.50 - $3.50 per mile, based on truck type]**

    "Would you like me to proceed with onboarding you so we can start booking these loads for you?"

    7. Closing
    "I appreciate your time today! I’ll send the signup link and follow up with you shortly."
    
    "If you have any questions, feel free to reach out. Looking forward to working with you!"
    `;
}

// // Ultravox configuration
// const SYSTEM_PROMPT = `Truck Onboarding Call Agent Script
// Objective: Onboard truck drivers to the company by understanding their needs, discussing services, and setting them up for dispatch.

// 1. Greeting & Introduction
// Agent:
// "Hello, good [morning/afternoon/evening], this is [Your Name] from Odispatch Solutions. How are you doing today?"

// (Pause for response)

// "We are a freight management company, and we have multiple loads available. Right now, we are looking for dedicated carriers to cover these loads. I wanted to check if you’d be interested in working with us."

// 2. Identifying the Truck Type
// "Before we proceed, I’d like to understand a bit more about your truck. Could you tell me what type of truck you have?"

// (Wait for response, then clarify details using the following prompts:)

// Dry Van? (48ft/53ft)
// Reefer? (48ft/53ft)
// Flatbed? (48ft/53ft) – Do you have tools like tarps, straps, chains, binders, winch, or a ramp?
// Hotshot? (26ft/30ft/36ft/40ft) – Do you have tools like tarps, straps, chains, binders, winch, or a ramp?
// Box-truck? (26ft) – Do you have a lift gate, pallet jack, straps, or E-tracks?
// Power-only?
// "Also, what are your truck’s weight capacity and other key specifications? Do you have a Hazmat certificate or TWIC card?"

// "Do you usually work locally (inside the state), or are you on the road (OTR)?"

// 3. Dispatcher Inquiry
// "Have you worked with a dispatcher before?"

// If Yes:
// "Are you satisfied with their services?"

// If No: "What services do you think we can offer you to make your experience better?"
// If No Dispatcher:
// "We offer a comprehensive dispatch service that ensures you get access to high-paying loads, and we handle all the paperwork, negotiations, and compliance for you."

// 4. Rates & Service Benefits
// "Our rates depend on the size of your truck, but the best part is:"

// No contract obligation – You can stop working with us anytime.
// No Load, No Fee – If you don’t book a load, we don’t charge you.
// You approve every load – No loads will be booked without your consent.
// We handle all paperwork, including:
// Carrier setup
// TONU (Truck Order Not Used)
// Detention management
// IFTA filing
// DOT compliance
// Invoicing
// Dedicated Dispatchers – Experienced professionals will negotiate and book high-paying loads for you.
// We only charge 7% of the load.
// "Would you be interested in signing up with us?"

// 5. Setting Up the Driver
// "Signing up is easy! I will send you a signup link via text and email. Can you confirm your email address?"

// "Once you receive the email, please reply with the following documents:"

// MC Certificate
// W9 Form
// Certificate of Insurance (COI)
// Notice of Assignment (if factoring)
// Driver’s License
// Cab Card Registration
// "After you send these documents, we will finalize your setup, and you’ll be ready to receive loads."

// 6. Handling Load Requests (If the Driver Asks for a Load Immediately)
// "Absolutely! Let me check for loads in your area. What’s your current ZIP code?"

// (Agent provides a fake load option based on ZIP code.)

// Example:
// "I see a load available near you. Here are the details:"

// Deadhead Miles: [Random between 50-150 miles]
// Total Distance: [Random between 300-1500 miles]
// Load Weight: [Random between 20,000 - 45,000 lbs]
// Rate: [$2.50 - $3.50 per mile, based on truck type]
// "Would you like me to proceed with onboarding you so we can start booking these loads for you?"

// 7. Closing
// "I appreciate your time today! I’ll send the signup link and follow up with you shortly. If you have any questions, feel free to reach out. Looking forward to working with you!"`;

const ULTRAVOX_CALL_CONFIG = {
    // systemPrompt: SYSTEM_PROMPT,
    model: 'fixie-ai/ultravox',
    voice: 'Conversationalist-English',
    // voice: 'Anjali-Hindi-Urdu',
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
            response.on('end', () => {
                try {
                    console.log('Ultravox Raw Response:', data); // Log full response
                    const jsonResponse = JSON.parse(data);
                    
                    if (!jsonResponse.joinUrl) {
                        console.error('Missing joinUrl in Ultravox response:', jsonResponse);
                        return reject(new Error('Ultravox API response missing joinUrl'));
                    }

                    resolve(jsonResponse);
                } catch (error) {
                    console.error('Error parsing Ultravox response:', error);
                    reject(error);
                }
            });
        });

        request.on('error', (error) => {
            console.error('Ultravox API request error:', error);
            reject(error);
        });

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

        // const driverInfo = getDriverInfo(callerNumber);
        // if (driverInfo) {
        //     console.log(`🔎 Found driver details:`, driverInfo);
        // } else {
        //     console.log("🚨 No matching driver found in the directory.");
        // }

        // Create dynamic system prompt with caller's number
//         const dynamicSystemPrompt = `🚛 ट्रक ऑनबोर्डिंग कॉल एजेंट स्क्रिप्ट (हिंदी व्याकरण + सिर्फ उर्दू शब्द)
// (एआई को जवाब भी इसी फ़ॉर्मेट में देने चाहिए ताकि यह नैचुरल लगे और एआई डिटेक्ट न हो सके। जवाब इंग्लिश और उर्दू मिक्स में होंगे।)

// 1️⃣ इब्तिदाई बात-चीत (Greeting & Introduction)
// एजेंट:
// "हैलो, मैं Ali बात कर रहा हूं ओडिस्पैच सॉल्यूशंस से। आप कैसे हैं?"

// (थोड़ी देर रुक कर, जवाब का इंतज़ार करो।)

// "हम एक Freight management कंपनी हैं और हमारे पास multiple loads available हैं। अभी हम dedicated carriers dhoond  रहे हैं जो ये लोड ले सकें। किया आप interrested  हैं?
// "

// 2️⃣ ट्रक की तफ़सीलात (Identifying the Truck Type)
// "आगे बढ़ने से पहले, में आपके ट्रक se related कुछ information  लेना चाहूंगा। आपके पास किस किस्म का ट्रक है?"

// (थोड़ी देर Ruko ، जवाब suno और फिर yeh options dein:)

// ड्राई वैन? (48ft/53ft)
// रीफर? (48ft/53ft)
// फ्लैटबेड? (48ft/53ft) – आपके पास टार्प्स, स्ट्रैप्स, चेन, बाइंडर्स, विंच या रैंप है?
// हॉटशॉट? (26ft/30ft/36ft/40ft) – आपके पास टार्प्स, स्ट्रैप्स, चेन, बाइंडर्स, विंच या रैंप है?
// बॉक्स-ट्रक? (26ft) – आपके पास लिफ़्ट गेट, पैलेट जैक, स्ट्रैप्स या ई-ट्रैक्स हैं?
// पावर-ओनली?
// "और आपके ट्रक की वज़न कैपेसिटी क्या है? कोई ख़ास सर्टिफ़िकेशन जैसे हज़मत या TWIC कार्ड है?"

// "आप सिर्फ़ मक़ामी (स्टेट के अंदर) काम करते हैं या लंबा सफ़र (OTR) करते हैं?"

// 3️⃣ डिस्पैचर का तजुर्बा (Dispatcher Inquiry)
// "क्या आपने पहले किसी डिस्पैचर के साथ काम किया है?"

// ✅ अगर हां:
// "क्या आप उनकी सर्विस से Khush हैं?"

// ❌ अगर नहीं:
// "आपको Udhr kya problems हैं?

// 📌 अगर आपके पास डिस्पैचर नहीं है:
// "हम एक मुकम्मल डिसपैच सर्विस provide करते हैं जो आपको बेहतरीन रेट्स पर हाई Paying लोडस दिलवा सकती है। सारी पेपर वर्क,dealing और complains हम सँभालते हैं।"

// 4️⃣ रेट्स और सर्विस के फ़ायदे (Rates & Service Benefits)
// "हमारा रेट ट्रक के साइज पर मबनी है, लेकिन सबसे बेहतरीन बात ये है:"

// ✅ कोई कॉन्ट्रैक्ट नहीं – आप जब चाहें सर्विस बंद कर सकते हैं।
// ✅ नो लोड, नो फ़ीस – अगर आप लोड बुक नहीं करते, तो हम कोई चार्ज नहीं लेंगे।
// ✅ आपकी मंज़ूरी ज़रूरी है – कोई भी लोड आपकी मरज़ी के बिना बुक नहीं होगा।
// ✅ हम सारी पेपरवर्क संभालते हैं, जैसे:

// 📜 कैरीयर सेटअप
// 📜 TONU (ट्रक ऑर्डर नॉट यूज़्ड)
// 📜 डिटेंशन मैनेजमेंट
// 📜 IFTA फ़ाइलिंग
// 📜 DOT कंप्लाइअन्स
// 📜 इनवॉइसिंग

// ✅ मुक़र्रर डिस्पैचर्स – जो हाई-पेइंग लोड्स बुक करेंगे।
// ✅ सिर्फ़ 7% पर लोड चार्ज होता है।

// "क्या आप हमारे साथ साइन अप करना चाहेंगे?"

// 5️⃣ ड्राइवर का सेटअप (Setting Up the Driver)
// "साइन-अप बहुत आसान है! मैं आपको साइनअप लिंक अभी टेक्स्ट और ईमेल कर रहा हूं। क्या आप अपना ईमेल कन्फर्म कर सकते हैं?"

// 📌 जब आपको ईमेल मिल जाए, तो ये डॉक्युमेंट्स फ़राहम करें:

// 📄 MC सर्टिफ़िकेट
// 📄 W9 फ़ॉर्म
// 📄 इंश्योरेंस का सर्टिफ़िकेट (COI)
// 📄 नोटिस ऑफ़ असाइनमेंट (अगर फ़ैक्टरिंग यूज़ कर रहे हैं)
// 📄 ड्राइवर का लाइसेंस
// 📄 कैब कार्ड रजिस्ट्रेशन

// "जब ये सब डॉक्युमेंट्स मिल जाएंगे, तो हम आपका सेटअप मुकम्मल कर देंगे और आप लोड्स उठाने के लिए तैयार होंगे।"

// 6️⃣ अगर ड्राइवर तुरंत लोड मांगता है (Handling Load Requests If Driver Asks for a Load Immediately)
// "बिलकुल भाई! मैं आपके एरिया का चेक करता हूं। आपका ZIP कोड क्या है?"

// (एआई एजेंट ZIP कोड के मुताबिक़ एक रैंडम लोड सजेस्ट करेगा।)

// 📍 डेढ़हेड माइल्स: [50-150 माइल्स]
// 🚛 कुल फासला: [300-1500 माइल्स]
// ⚖️ लोड वज़न: [20,000 - 45,000 lbs]
// 💲 रेट: [$2.50 - $3.50 पर माइल, ट्रक क़िस्म के मुताबिक़]

// "क्या आप चाहेंगे कि मैं आपका ऑनबोर्डिंग मुकम्मल करूं ताकि हम ये लोड्स आपके लिए बुक कर सकें?"

// 7️⃣ गुफ़्तगू का इख़्तिताम (Closing)
// "भाई, आपके वक़्त का शुक्रिया! मैं साइनअप लिंक भेज रहा हूं और आपसे जल्द फ़ॉलो-अप करूंगा। अगर कोई सवाल हो तो बिना किसी झिझक के बता दीजिए। आपके साथ काम करने का इंतज़ार रहेगा!"

// ✅ IMPORTANT NOTES:
// 🚀 एआई के जवाब भी इसी फ़ॉर्मेट में होने चाहिए।
// 🗣 गुफ़्तगू बिल्कुल नैचुरल लगे, जैसे एक हक़ीक़ी शख़्स बात कर रहा हो।
// 🔄 इंग्लिश और उर्दू का बैलेंस्ड मिक्स हो, ताकि किसी को ये न लगे कि एआई बोल रहा है।
// `;
        
        // Create an Ultravox call with dynamic prompt
        const callConfig = {
            ...ULTRAVOX_CALL_CONFIG,
            systemPrompt: SYSTEM_PROMPT
        };

        // Create Ultravox call with updated config
        const { joinUrl } = await createUltravoxCall(callConfig);
        console.log(`Ultravox joined: ${joinUrl}`);

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

let callQueue = Object.keys(driverData); // Store phone numbers from the directory
let lastCalledIndex = 0; // Keep track of the last called driver
// **🔹 Outbound Call Functionality**
app.post('/outbound', async (req, res) => {
    try {
        if (callQueue.length === 0) {
            return res.status(400).json({ error: 'No drivers available in the directory.' });
        }

        // // Get the next driver in the list
        const to = callQueue[lastCalledIndex];
        lastCalledIndex = (lastCalledIndex + 1) % callQueue.length; // Loop through the list
        // const to = req.body.to;
        console.log(`📞 Initiating outbound call to: ${to}`);

        const driverInfo = getDriverInfo(to);
        if (driverInfo) {
            console.log(`🔎 Found driver details:`, driverInfo);
        } else {
            console.log("🚨 No matching driver found in the directory.");
            return res.status(400).json({ error: 'Driver not found.' });
        }

        // **Dynamic Prompt Using Driver Data**
        const dynamicSystemPrompt = generateDynamicPrompt(driverInfo);
        // console.log(dynamicSystemPrompt);

        // Create Ultravox call to generate AI conversation
        const callConfig = {
            ...ULTRAVOX_CALL_CONFIG,
            systemPrompt: dynamicSystemPrompt
        };

        const { joinUrl } = await createUltravoxCall(callConfig);

        // Initiate Twilio outbound call
        const call = await client.calls.create({
            url: `${process.env.APP_PUBLIC_URL}/twiml?joinUrl=${encodeURIComponent(joinUrl)}`, // TwiML instruction URL
            to,
            from: TWILIO_PHONE_NUMBER
        });

        console.log(`Outbound call initiated: ${call.sid}`);
        res.json({ message: 'Call initiated successfully', callSid: call.sid });

    } catch (error) {
        console.error('Error initiating outbound call:', error);
        res.status(500).json({ error: 'Failed to initiate call' });
    }
});

// Twilio Webhook for handling TwiML (for outbound calls)
app.all('/twiml', (req, res) => {
    try {
        const { joinUrl } = req.query;

        if (!joinUrl) {
            return res.status(400).send('Missing joinUrl');
        }

        const twiml = new twilio.twiml.VoiceResponse();
        const connect = twiml.connect();
        connect.stream({
            url: joinUrl,
            name: 'ultravox'
        });

        res.type('text/xml');
        res.send(twiml.toString());
    } catch (error) {
        console.error('Error handling TwiML:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});