import re
with open(r'D:/File/C++/MyCookieCenter/plugins/weread_claim/weread_claim.js', 'r', encoding='utf-8') as f:
    code = f.read()

issues = []

# const/let
for m in re.finditer(r'^(\s*)(const|let)\s', code, re.MULTILINE):
    lineno = code[:m.start()].count('\n') + 1
    issues.append(f'L{lineno}: {m.group().strip()} (const/let var)')

# Arrow functions  
for m in re.finditer(r'=>\s*\{?', code):
    lineno = code[:m.start()].count('\n') + 1
    line = code.split('\n')[lineno-1].strip()[:80]
    if '=>' in line:
        issues.append(f'L{lineno}: arrow function: {line}')

# $script in global scope before try
lines = code.split('\n')
for i, line in enumerate(lines):
    if '$script' in line:
        print(f'  L{i+1}: {line.strip()[:120]}')

print()
if issues:
    print('=== POTENTIAL ISSUES ===')
    for iss in issues[:15]:
        print(f'  {iss}')
else:
    print('No const/let or arrow function issues found')

# Check for $request access at module scope
print()
print('=== Module-scope variable access ===')
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped and not stripped.startswith('//') and not stripped.startswith('/*') and not stripped.startswith('*'):
        if '$request' in stripped and 'function' not in stripped:
            if i > 200:  # after function definitions
                print(f'  L{i+1}: {stripped[:120]}')
        if '$response' in stripped and 'function' not in stripped:
            if i > 200:
                print(f'  L{i+1}: {stripped[:120]}')
