import json

with open(r'D:/WeCaht/xwechat_files/wxid_pw1pznjql1eu22_fc1f/msg/file/2026-07/320_1785134896193.har', 'r', encoding='utf-8', errors='replace') as f:
    har = json.load(f)

entries = har['log']['entries']
cookie_hits = 0
no_cookie = 0
samples = []

for e in entries:
    found = False
    for h in e['request']['headers']:
        if h['name'].lower() == 'cookie' and h['value'].strip():
            cookie_hits += 1
            if len(samples) < 3:
                samples.append((e['request']['url'][:100], h['value'][:120]))
            found = True
            break
    if not found:
        no_cookie += 1

print('Requests WITH Cookie: ' + str(cookie_hits))
print('Requests WITHOUT Cookie: ' + str(no_cookie))
print()
print('Sample cookies:')
for url, cookie in samples:
    print('  URL: ' + url)
    print('  Cookie: ' + cookie)
    print()

# Check all unique cookie values on i.weread.qq.com
print('=== Cookie values on i.weread.qq.com ===')
weread_cookies = set()
for e in entries:
    if 'i.weread.qq.com' in e['request']['url']:
        for h in e['request']['headers']:
            if h['name'].lower() == 'cookie' and h['value'].strip():
                weread_cookies.add(h['value'])

for c in sorted(weread_cookies):
    print('  [' + str(len(c)) + ' chars] ' + c)

# Check if wr_vid appears
print()
found_vid = False
for e in entries:
    for h in e['request']['headers']:
        if h['name'].lower() == 'cookie' and 'wr_vid' in h['value']:
            print('wr_vid found: ' + h['value'][:120])
            found_vid = True
            break
    if found_vid:
        break

if not found_vid:
    print('wr_vid NOT found in any request cookie header')

# Also check login response for vid
print()
for e in entries:
    if '/login' in e['request']['url'] and e['request']['method'] == 'POST':
        content = e['response'].get('content', {})
        if 'text' in content:
            import base64
            decoded = base64.b64decode(content['text']).decode('utf-8')
            parsed = json.loads(decoded)
            print('Login response vid: ' + str(parsed.get('vid')))
        break

# Check weread.qq.com Set-Cookie
print()
print('=== Set-Cookie containing wr_vid ===')
for e in entries:
    for h in e['response']['headers']:
        if h['name'].lower() == 'set-cookie' and 'wr_vid' in h['value']:
            print(h['value'][:200])
            break
    else:
        continue
    break
