const fs = require('fs');

const harFiles = [
    "d:\\WeCaht\\xwechat_files\\wxid_pw1pznjql1eu22_fc1f\\msg\\file\\2026-07\\321_1785249769423.har",
    "d:\\WeCaht\\xwechat_files\\wxid_pw1pznjql1eu22_fc1f\\msg\\file\\2026-07\\322_1785305577213.har",
    "d:\\WeCaht\\xwechat_files\\wxid_pw1pznjql1eu22_fc1f\\msg\\file\\2026-07\\323_1785400854056.har"
];

let output = "";

for (const harFile of harFiles) {
    const fileName = harFile.split('\\').pop();
    output += `\n=== ${fileName} ===\n`;

    if (!fs.existsSync(harFile)) {
        output += "  FILE NOT FOUND\n";
        continue;
    }

    const raw = fs.readFileSync(harFile, 'utf8');
    let har;
    try {
        har = JSON.parse(raw);
    } catch(e) {
        output += `  JSON PARSE ERROR: ${e.message}\n`;
        continue;
    }

    const entries = har.log.entries;
    output += `  Total entries: ${entries.length}\n`;

    // Filter for flip/card/raffle/game related URLs
    const flipEntries = entries.filter(e => 
        /flip|card-game|raffle|flipCard|gift|prize/i.test(e.request.url)
    );

    output += `  Flip/Card/Raffle entries: ${flipEntries.length}\n`;

    for (const e of flipEntries) {
        const method = e.request.method;
        const url = e.request.url;
        const status = e.response.status;

        output += `\n  [${method}] ${url.substring(0, 200)}\n`;
        output += `    Status: ${status}\n`;

        // Show interesting request headers
        const reqHeaders = e.request.headers || [];
        for (const h of reqHeaders) {
            if (/cookie|vid|skey|content-type|authorization/i.test(h.name)) {
                const val = h.value.length > 150 ? h.value.substring(0, 150) + "..." : h.value;
                output += `    ReqHeader: ${h.name} = ${val}\n`;
            }
        }

        // Show request body if POST
        if (method === "POST" && e.request.postData && e.request.postData.text) {
            const body = e.request.postData.text.length > 400 ? e.request.postData.text.substring(0, 400) + "..." : e.request.postData.text;
            output += `    ReqBody: ${body}\n`;
        }

        // Show response body
        const respContent = e.response.content;
        if (respContent && respContent.text) {
            const body = respContent.text.length > 600 ? respContent.text.substring(0, 600) + "..." : respContent.text;
            output += `    RespBody: ${body}\n`;
        }
    }

    // Also list all unique weread.qq.com URLs (not i.weread)
    const wereadUrls = new Set();
    for (const e of entries) {
        if (/:\/\/weread\.qq\.com/.test(e.request.url) && !/i\.weread\.qq\.com/.test(e.request.url)) {
            wereadUrls.add(e.request.method + " " + e.request.url);
        }
    }

    if (wereadUrls.size > 0) {
        output += `\n  --- All weread.qq.com (non-i.weread) URLs ---\n`;
        for (const u of wereadUrls) {
            output += `    ${u.substring(0, 200)}\n`;
        }
    }
}

fs.writeFileSync("d:\\File\\C++\\MyCookieCenter\\har_output.txt", output, 'utf8');
console.log("DONE - output written to har_output.txt");
console.log(output.substring(0, 3000));
