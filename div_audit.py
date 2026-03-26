import re
try:
    with open(r'e:\firefox3\Fireflow\src\operations\customers\CustomersView.tsx', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    depth = 0
    with open(r'e:\firefox3\Fireflow\div_audit.txt', 'w', encoding='utf-8') as out:
        for i, line in enumerate(lines):
            opens = len(re.findall(r'<div', line))
            closes = len(re.findall(r'</div>', line))
            depth += opens - closes
            out.write(f'{i+1:4} | {depth:3} | {line.strip()}\n')
    print("Audit written to e:\\firefox3\\Fireflow\\div_audit.txt")
except Exception as e:
    print(f"Error: {e}")
