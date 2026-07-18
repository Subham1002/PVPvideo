const express = require('express');
const path = require('path');
const fs = require('fs');

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore'); 
const geoip = require('geoip-lite');

// Initialize Firebase with hardcoded credentials (no .env required)
initializeApp({
  credential: cert({
    projectId: "pvp-video",
    clientEmail: "firebase-adminsdk-fbsvc@pvp-video.iam.gserviceaccount.com",
    privateKey: `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDFK+ib+m2IljnQ\nMkYuRv1TxId9q8UroBI7dN0Z0kTlxPrst97Q2Otvq8gqGt/lUjG3leMCq8gmYPHg\nrCpXyBQFUgv/OApWLllytI1uhBDm0IMNP7Wf/sgXieXnphJVYOqBV464vCl12hIE\nOgTKOZcmBA/J+0FMRw77gzpJLM6EdP0H8o6nZT7VMZVckt2372Fdf0b3qGgOYBTE\n0HldZgWkE8vPFr6HQyahIzaAXdn5qdZgHssebCFPPRzslNtFf83fsE0effAtpH5j\nlJVJnerY83TgPrftu0ls0ZmNmQuF2LyMCH/PP0CCM7yKjUke5V5VBRyRkwdvfn04\nZA49jHl1AgMBAAECggEAMIvHEeBu55pVUbWPIgXIib9xvLd2LG+VDZ6QcbMb05bU\nUURUUAeYsD4TYoqLZeL+6ry00AuLlCd6Zl79be+NPmIdIhGiOeXfkCZ0TCmoH6xn\nF/P/vAz3JxSEzqxNB0h9dKsiMMnjS2kN1oyScVgMpweI+6opQaadQb/lse6eSm40\n3C1FiJVuj0RsPrGOK+elTiicQeCSn0s9I4+sXZNrqyMp0i8Ix8cX4n5oGyGdezWg\nwZxLf+jkB1S4LBJIjxdwaCPav3QWVRWRajbNtU5RKm8Q2jVp7XLYmJM49KWrFn3O\nLLR/kUHXh34VfL59W19yq1Vw3C00i9ZwOoK77MloYQKBgQDhi0z/Akyc/uD0RAFc\n3K0vW2MMazEXaysZuTmma0PCPHTlt4+Y5UG0q5A5meAbm6LpJYFewclr95cT/l5d\nVIXSrMIaF23/hkfUrr17pqAQge4f+HKz3ZijMcjLS1n0SxTwmQ1t8HVY0tKItFoV\nz0RzOOsM7IC2jnzHdFRLM+298wKBgQDfy8/MeWNm/4RbfmTgd+n3R1C8WX56ZY6k\nwgaEC2UBDEGId1b/Mc8wkddbbqZ5wNltDPhYPdnbSc1jaasPHgiVy60K/rQ2D6EY\n5I8jFzAC0NyJrze00Z1JRSCkgPejaVSqp+2MYoKwlIKhc6VlalUtcgaTXQLR8POO\nqLn869X89wKBgQC487BqFYqZ23DBHds4OUZTZU9t6aDSIXGwoHGkBKYF6+m4TrSU\nnrso2t9kPMjIGvKW2cii2arAvMHJBXiAdEVhI4XwO3JabdUNlVWQxmzP3JxW3zfA\nQ2Fdwf90pg/YApHjUr7ufpbcBdXbgHm3FMZ+7hfh+zb5fRLZxI0zNhwo/QKBgDp7\nYjQGzKkPwKDAKNBXxbYu1rRBlsGZZGs9oMJE0AI0F7P3q65Ib+I7WlG0WqCaerb6\nmrNEhne9k4SVCnSK3qd2cCPdZ25xKyH8KEN9Pbiep+L6/M2tsTKCdANJCG2ViuCF\nvZff7lMCnBhgxin4XYXgtEMyHRiLpLn08ZVcc7EFAoGBALrsNba3F8+b+T1pHs90\nM6PPq/mI/oiOY00JbCQ1ob0j3Q8iJ/vVtXrm5JNXaRcHBC/ujaYSHbamDkuj1jNg\ne4kqltwkUTn9C3V45HbmR4iKbxhz905/c1yf5MfT6GtI/hk27FOn6d/u467daPfR\nTGJdtL3p932katglGHlJ465w\n-----END PRIVATE KEY-----\n`.replace(/\\n/g, '\n'),
  })
});

const db = getFirestore();
const app = express();
const PORT = 8080;

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