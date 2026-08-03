const fs = require('fs');

const harFile = "d:\\WeCaht\\xwechat_files\\wxid_pw1pznjql1eu22_fc1f\\msg\\file\\2026-07\\321_1785249769423.har";
const raw = fs.readFileSync(harFile, 'utf8');
const har = JSON.parse(raw);
const entries = har.log.entries;

// Find all flipCardFlip requests in chronological order (reverse of HAR order)
const flipEntries = entries.filter(e => 
    /flip-card-game\/api\/flipCardFlip/.test(e.request.url)
);

// HAR entries are typically in reverse chronological order in Loon
// Let's reverse to get chronological order
const chrono = [...flipEntries].reverse();

let output = "";
output += `=== flipCardFlip requests (chronological order) ===\n`;
output += `Total flip requests: ${chrono.length}\n\n`;

for (let i = 0; i < chrono.length; i++) {
    const e = chrono[i];
    const url = new URL(e.request.url);
    const cardIndex = url.searchParams.get('cardIndex');
    const giftIndex = url.searchParams.get('giftIndex');
    
    output += `--- Flip #${i+1}: cardIndex=${cardIndex}, giftIndex=${giftIndex} ---\n`;
    
    // Decode response body (Base64)
    const respBody = e.response.content.text;
    if (respBody) {
        try {
            const decoded = Buffer.from(respBody, 'base64').toString('utf8');
            const data = JSON.parse(decoded);
            output += `remainingCount: ${data.remainingCount}\n`;
            output += `userType: ${data.userType}\n`;
            output += `cardList (${data.cardList ? data.cardList.length : 0} cards):\n`;
            if (data.cardList) {
                for (const card of data.cardList) {
                    let cardInfo = `  cardIndex=${card.cardIndex}, type=${card.cardType}, status=${card.status}, autoReceive=${card.autoReceive}`;
                    if (card.infinite !== undefined) cardInfo += `, infinite=${card.infinite}`;
                    if (card.bookInfo) {
                        cardInfo += `\n    book: id=${card.bookInfo.bookId}, title="${(card.bookInfo.title || '').substring(0, 30)}", author="${(card.bookInfo.author || '').substring(0, 20)}"`;
                    }
                    output += cardInfo + "\n";
                }
            }
            // Check for any other fields
            const knownFields = ['remainingCount', 'userType', 'cardList'];
            const extraFields = Object.keys(data).filter(k => !knownFields.includes(k));
            if (extraFields.length > 0) {
                output += `Extra fields: ${JSON.stringify(extraFields)}\n`;
                for (const f of extraFields) {
                    output += `  ${f}: ${JSON.stringify(data[f]).substring(0, 200)}\n`;
                }
            }
        } catch(err) {
            output += `Decode error: ${err.message}\n`;
            output += `Raw (first 100): ${respBody.substring(0, 100)}\n`;
        }
    }
    output += "\n";
}

// Also check for any Next.js data prefetch that might contain initial board state
const nextDataEntries = entries.filter(e => 
    /flip-card-game\/_next\/data/.test(e.request.url)
);

output += `\n=== Next.js data prefetch entries: ${nextDataEntries.length} ===\n`;
for (const e of nextDataEntries) {
    output += `${e.request.method} ${e.request.url.substring(0, 200)}\n`;
    if (e.response.content.text) {
        try {
            const decoded = Buffer.from(e.response.content.text, 'base64').toString('utf8');
            output += `Body: ${decoded.substring(0, 500)}\n`;
        } catch {
            output += `Raw: ${e.response.content.text.substring(0, 200)}\n`;
        }
    }
}

// Check for any other flip-card-game/api requests (not exporter, not flipCardFlip)
const otherApiEntries = entries.filter(e => 
    /flip-card-game\/api\//.test(e.request.url) && 
    !/exporter/.test(e.request.url) &&
    !/flipCardFlip/.test(e.request.url)
);

output += `\n=== Other flip-card-game/api entries: ${otherApiEntries.length} ===\n`;
for (const e of otherApiEntries) {
    output += `${e.request.method} ${e.request.url.substring(0, 200)}\n`;
    if (e.response.content.text) {
        try {
            const decoded = Buffer.from(e.response.content.text, 'base64').toString('utf8');
            output += `Body: ${decoded.substring(0, 500)}\n`;
        } catch {
            output += `Raw: ${e.response.content.text.substring(0, 200)}\n`;
        }
    }
}

fs.writeFileSync("d:\\File\\C++\\MyCookieCenter\\flip_decoded.txt", output, 'utf8');
console.log(output);
