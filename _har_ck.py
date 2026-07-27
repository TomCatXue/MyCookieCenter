import json, base64

with open(r'D:/WeCaht/xwechat_files/wxid_pw1pznjql1eu22_fc1f/msg/file/2026-07/320_1785134896193.har', 'r', encoding='utf-8', errors='replace') as f:
    har = json.load(f)

entries = har['log']['entries']

# 1. Which i.weread.qq.com endpoints carry cookies?
print('=== i.weread.qq.com requests WITH cookies ===')
count = 0
for e in entries:
    if 'i.weread.qq.com' not in e['request']['url']:
        continue
    has_cookie = False
    cookie_val = ''
    for h in e['request']['headers']:
        if h['name'].lower() == 'cookie' and h['value'].strip():
            has_cookie = True
            cookie_val = h['value']
            break
    if has_cookie:
        url = e['request']['url'].split('i.weread.qq.com')[1].split('?')[0]
        print('  ' + e['request']['method'] + ' ' + url + ' -> ' + cookie_val)
        count += 1
        if count >= 20:
            break

# 2. Check all header names seen on i.weread.qq.com (case-sensitive)
print()
print('=== All header NAMES seen on i.weread.qq.com ===')
all_headers = set()
for e in entries:
    if 'i.weread.qq.com' not in e['request']['url']:
        continue
    for h in e['request']['headers']:
        all_headers.add(h['name'])

for name in sorted(all_headers):
    print('  ' + name)

# 3. Check if Cookie header is always lowercase 'cookie' or sometimes 'Cookie'
print()
print('=== Cookie header casing ===')
cases = {}
for e in entries:
    for h in e['request']['headers']:
        if h['name'].lower() == 'cookie' and h['value'].strip():
            cases[h['name']] = cases.get(h['name'], 0) + 1
for k, v in sorted(cases.items()):
    print('  ' + repr(k) + ': ' + str(v) + ' times')

# 4. Check specific endpoints that fire when user visits profile page
print()
print('=== /user/profile requests ===')
for e in entries:
    if '/user/profile' in e['request']['url']:
        cookie = ''
        for h in e['request']['headers']:
            if h['name'].lower() == 'cookie' and h['value'].strip():
                cookie = h['value']
        print('  Method: ' + e['request']['method'])
        print('  Cookie: ' + (cookie if cookie else 'NONE'))
        # response content
        content = e['response'].get('content', {})
        if 'text' in content:
            try:
                decoded = base64.b64decode(content['text']).decode('utf-8')
                parsed = json.loads(decoded)
                print('  Response has canExchangeDay: ' + str('canExchangeDay' in parsed))
            except:
                pass
        break

# 5. Member card summary - polled every 10-15s
print()
print('=== /pay/memberCardSummary (first 3 with cookies) ===')
mc_count = 0
for e in entries:
    if '/pay/memberCardSummary' in e['request']['url']:
        cookie = ''
        for h in e['request']['headers']:
            if h['name'].lower() == 'cookie' and h['value'].strip():
                cookie = h['value']
        if cookie:
            print('  ' + e['request']['method'] + ' Cookie: ' + cookie)
            mc_count += 1
            if mc_count >= 3:
                break
