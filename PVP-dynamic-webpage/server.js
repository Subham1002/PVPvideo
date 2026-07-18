const express = require('express');
const path = require('path');
const fs = require('fs');

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore'); 
const geoip = require('geoip-lite');

require('dotenv').config();

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

const db = getFirestore();
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ---------------------------------------------------------
// 1. AGGREGATED CARD-BASED ANALYTICS ROUTE
// ---------------------------------------------------------
app.get('/dashboard/analytics', async (req, res) => {
    try {
        // Fetch raw tracking pings sequentially
        const snapshot = await db.collection('analytics').orderBy('timestamp', 'desc').limit(200).get();
        
        // Group raw records into clear, singular structures mapped by user ID
        const prospectGroups = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const uid = data.uniqueId || 'Unknown_Target';
            
            if (!prospectGroups[uid]) {
                prospectGroups[uid] = {
                    id: uid,
                    location: data.location || 'Unknown Location',
                    ip: data.ip || '0.0.0.0',
                    history: []
                };
            }
            
            const eventTime = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Just now';
            prospectGroups[uid].history.push({
                event: data.event,
                mark: data.currentTime,
                time: eventTime
            });
        });

        // Assemble interactive card components
        let htmlCards = '';
        Object.values(prospectGroups).forEach(group => {
            let activityList = '';
            group.history.forEach(act => {
                let badgeColor = 'bg-gray-700 text-gray-300';
                if (act.event.includes('Started')) badgeColor = 'bg-blue-600 text-white font-bold';
                if (act.event.includes('Watched')) badgeColor = 'bg-yellow-600 text-white';
                if (act.event.includes('Finished')) badgeColor = 'bg-green-600 text-white font-bold';
                if (act.event.includes('Left')) badgeColor = 'bg-red-600 text-white';

                activityList += `
                    <div class="flex justify-between items-center bg-gray-900/50 p-2.5 rounded border border-gray-800 text-xs font-mono">
                        <div class="flex items-center space-x-2">
                            <span class="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${badgeColor}">${act.event}</span>
                            <span class="text-gray-400">at mark: <strong class="text-white">${act.mark}s</strong></span>
                        </div>
                        <span class="text-gray-500">${act.time}</span>
                    </div>
                `;
            });

            htmlCards += `
                <div class="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden p-6 space-y-4">
                    <div class="flex justify-between items-start border-b border-gray-700 pb-3">
                        <div>
                            <h2 class="text-lg font-bold text-blue-400 font-mono tracking-tight">${group.id}</h2>
                            <p class="text-xs text-gray-400 mt-1 flex items-center">
                                <svg class="h-3 w-3 mr-1 text-yellow-500 fill-current" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                                ${group.location}
                            </p>
                        </div>
                        <span class="bg-gray-900 text-gray-500 font-mono text-[10px] px-2 py-1 rounded border border-gray-800">IP: ${group.ip}</span>
                    </div>
                    <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                        ${activityList}
                    </div>
                </div>
            `;
        });

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <title>Syntak Engagement Radar</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-900 text-white p-6 md:p-12 font-sans">
            <div class="max-w-7xl mx-auto space-y-8">
                <header class="border-b border-gray-800 pb-4">
                    <h1 class="text-3xl font-black tracking-tight text-white">Syntak Media <span class="text-blue-400">Engagement Radar</span></h1>
                    <p class="text-sm text-gray-400 mt-1">Prospect profiles tracking behavioral timelines grouped by unique link targets.</p>
                </header>
                <main class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${htmlCards || '<div class="col-span-full bg-gray-800 border border-gray-700 rounded-xl p-12 text-center text-gray-500 font-mono">No telemetry events recorded yet.</div>'}
                </main>
            </div>
        </body>
        </html>
        `);
    } catch (error) {
        console.error("Dashboard Render Error:", error);
        res.status(500).send("Error rendering analytics profile layout.");
    }
});

// ---------------------------------------------------------
// 2. THE ADVANCED BEHAVIORAL TRACKING RECEIVER
// ---------------------------------------------------------
app.post('/api/track', async (req, res) => {
    const { uniqueId, event, currentTime } = req.body;
    
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip.includes(',')) ip = ip.split(',')[0].trim(); 
    if (ip === '::1' || ip === '127.0.0.1') ip = '174.53.2.1'; // Local Testing Override Fallback

    const geo = geoip.lookup(ip);
    const location = geo ? `${geo.city}, ${geo.region}, ${geo.country}` : 'Location Unmapped';

    try {
        await db.collection('analytics').add({
            uniqueId,
            event,
            currentTime: currentTime || 0,
            location,
            ip,
            timestamp: FieldValue.serverTimestamp()
        });
        res.status(200).send('Logged');
    } catch (e) {
        res.status(500).send('Telemetry drop');
    }
});

// ---------------------------------------------------------
// 3. SECURE CONFIG-DRIVEN DYNAMIC ROUTE
// ---------------------------------------------------------
app.get('/:id', async (req, res) => {
    const uniqueId = req.params.id;
    if (uniqueId.includes('.')) return res.status(404).send('Not found');

    try {
        const docRef = db.collection('prospects').doc(uniqueId);
        const docSnap = await docRef.get();
        let htmlTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

        if (docSnap.exists) {
            const data = docSnap.data();
            htmlTemplate = htmlTemplate.replace(/{{PROSPECT_NAME}}/g, data.originalName || 'there');
            htmlTemplate = htmlTemplate.replace('{{VIDEO_URL}}', data.videoUrl);
            htmlTemplate = htmlTemplate.replace('{{LOADING_DISPLAY}}', 'none');
            htmlTemplate = htmlTemplate.replace('{{VIDEO_DISPLAY}}', 'block');
            htmlTemplate = htmlTemplate.replace('{{ERROR_MESSAGE}}', '');
        } else {
            htmlTemplate = htmlTemplate.replace(/{{PROSPECT_NAME}}/g, 'there');
            htmlTemplate = htmlTemplate.replace('{{VIDEO_URL}}', '');
            htmlTemplate = htmlTemplate.replace('{{LOADING_DISPLAY}}', 'flex');
            htmlTemplate = htmlTemplate.replace('{{VIDEO_DISPLAY}}', 'none');
            htmlTemplate = htmlTemplate.replace('{{ERROR_MESSAGE}}', 'Presentation Engine Offline — Link Missing.');
        }
        res.send(htmlTemplate);
    } catch (error) {
        console.error("Critical Serving Failure:", error);
        res.status(500).send("Internal Server Execution Fault");
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 System operational on execution port: ${PORT}`);
});